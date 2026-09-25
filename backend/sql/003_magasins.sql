-- ============================================================================
--  003 — Deux magasins : DÉPÔT et PHARMACIE
--
--  Ce que fait cette migration :
--   1. chaque lot et chaque mouvement porte désormais un LIEU
--      ('DEPOT' = réserve/magasin, 'PHARMACY' = officine de vente) ;
--   2. nouvelle table « transfers » : transfert de stock dépôt → pharmacie
--      (le pharmacien demande, le dépôt envoie, ou le dépôt propose) ;
--   3. les documents « commande fournisseur » et « retour fournisseur » sont
--      retirés (§9.4 et §9.12 du cahier des charges ne sont plus utilisés) ;
--   4. les rôles « Gestionnaire de stock » et « Vendeur habilité » sont
--      remplacés par le rôle « Dépôt » ; le pharmacien tient la vente.
--
--  Les données déjà enregistrées sont considérées comme appartenant à la
--  PHARMACIE (c'est là qu'elles étaient vendues avant cette version).
-- ============================================================================

-- ---------------------------------------------------------------- Lieux
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lots' AND column_name = 'location') THEN
    ALTER TABLE lots ADD COLUMN location VARCHAR(10);
    UPDATE lots SET location = 'PHARMACY';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movements' AND column_name = 'location') THEN
    ALTER TABLE movements ADD COLUMN location VARCHAR(10);
    UPDATE movements SET location = 'PHARMACY';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'losses' AND column_name = 'location') THEN
    ALTER TABLE losses ADD COLUMN location VARCHAR(10);
    UPDATE losses SET location = 'PHARMACY';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventories' AND column_name = 'location') THEN
    ALTER TABLE inventories ADD COLUMN location VARCHAR(10);
    UPDATE inventories SET location = 'PHARMACY';
  END IF;
END $$;

ALTER TABLE lots        ALTER COLUMN location SET DEFAULT 'DEPOT',    ALTER COLUMN location SET NOT NULL;
ALTER TABLE movements   ALTER COLUMN location SET DEFAULT 'PHARMACY', ALTER COLUMN location SET NOT NULL;
ALTER TABLE losses      ALTER COLUMN location SET DEFAULT 'PHARMACY', ALTER COLUMN location SET NOT NULL;
ALTER TABLE inventories ALTER COLUMN location SET DEFAULT 'PHARMACY', ALTER COLUMN location SET NOT NULL;

ALTER TABLE lots        ADD CONSTRAINT lots_location_check        CHECK (location IN ('DEPOT','PHARMACY'));
ALTER TABLE movements   ADD CONSTRAINT movements_location_check   CHECK (location IN ('DEPOT','PHARMACY'));
ALTER TABLE losses      ADD CONSTRAINT losses_location_check      CHECK (location IN ('DEPOT','PHARMACY'));
ALTER TABLE inventories ADD CONSTRAINT inventories_location_check CHECK (location IN ('DEPOT','PHARMACY'));

-- Un même numéro de lot peut exister dans les deux magasins (le dépôt garde la
-- marchandise d'origine, la pharmacie reçoit la sienne par transfert).
ALTER TABLE lots DROP CONSTRAINT IF EXISTS lots_product_id_supplier_id_number_key;
ALTER TABLE lots ADD CONSTRAINT lots_unique_location UNIQUE (product_id, supplier_id, number, location);

-- Types de documents : ajout de TRANSFER, retrait de RETURN.
ALTER TABLE movements DROP CONSTRAINT IF EXISTS movements_document_type_check;
ALTER TABLE movements ADD CONSTRAINT movements_document_type_check
  CHECK (document_type IN ('RECEIPT','TRANSFER','SALE','LOSS','ADJUSTMENT','CANCEL'));

CREATE INDEX IF NOT EXISTS lots_location_idx ON lots (location, product_id) WHERE status = 'AVAILABLE' AND quantity > 0;
CREATE INDEX IF NOT EXISTS movements_location_idx ON movements (location, created_at);

-- Le bon de réception mentionne le magasin d'entrée (toujours le dépôt) et la
-- vente le magasin de sortie (toujours la pharmacie) : utile pour les impressions.
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS location VARCHAR(10) NOT NULL DEFAULT 'DEPOT'
  CHECK (location IN ('DEPOT','PHARMACY'));
ALTER TABLE sales ADD COLUMN IF NOT EXISTS location VARCHAR(10) NOT NULL DEFAULT 'PHARMACY'
  CHECK (location IN ('DEPOT','PHARMACY'));

-- ------------------------------------------------- Transferts dépôt → pharmacie
CREATE TABLE IF NOT EXISTS transfers (
  id            SERIAL PRIMARY KEY,
  reference     VARCHAR(40) NOT NULL UNIQUE,
  user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  from_location VARCHAR(10) NOT NULL DEFAULT 'DEPOT'    CHECK (from_location IN ('DEPOT','PHARMACY')),
  to_location   VARCHAR(10) NOT NULL DEFAULT 'PHARMACY' CHECK (to_location   IN ('DEPOT','PHARMACY')),
  requested_by  INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  reason        TEXT        NOT NULL DEFAULT '',
  note          TEXT        NOT NULL DEFAULT '',
  cost_total    NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (cost_total >= 0),
  status        VARCHAR(20) NOT NULL DEFAULT 'VALIDATED' CHECK (status IN ('VALIDATED','CANCELLED')),
  request_key   UUID        NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at  TIMESTAMPTZ,
  cancelled_by  INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  cancel_reason TEXT,
  CONSTRAINT transfers_distinct CHECK (from_location <> to_location)
);
CREATE INDEX IF NOT EXISTS transfers_created_idx ON transfers (created_at DESC);

CREATE TABLE IF NOT EXISTS transfer_lines (
  id           SERIAL PRIMARY KEY,
  transfer_id  INTEGER NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  from_lot_id  INTEGER NOT NULL REFERENCES lots(id) ON DELETE RESTRICT,
  to_lot_id    INTEGER REFERENCES lots(id) ON DELETE RESTRICT,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost    NUMERIC(20,6) NOT NULL CHECK (unit_cost >= 0)
);
CREATE INDEX IF NOT EXISTS transfer_lines_transfer_idx ON transfer_lines (transfer_id);

CREATE TRIGGER transfers_no_delete BEFORE DELETE ON transfers
  FOR EACH ROW EXECUTE FUNCTION reject_validated_delete();

-- ------------------------------- Retrait des commandes et retours fournisseur
ALTER TABLE receipts      DROP CONSTRAINT IF EXISTS receipts_order_id_fkey;
ALTER TABLE receipt_lines DROP CONSTRAINT IF EXISTS receipt_lines_order_line_fk;
DROP INDEX IF EXISTS orders_supplier_idx;
DROP INDEX IF EXISTS orders_status_idx;
DROP INDEX IF EXISTS order_lines_order_idx;
DROP INDEX IF EXISTS supplier_returns_supplier_idx;
DROP INDEX IF EXISTS supplier_return_lines_return_idx;
ALTER TABLE receipts      DROP COLUMN IF EXISTS order_id;
ALTER TABLE receipt_lines DROP COLUMN IF EXISTS order_line_id;

DROP TRIGGER IF EXISTS returns_no_delete ON supplier_returns;
DROP TABLE IF EXISTS supplier_return_lines;
DROP TABLE IF EXISTS supplier_returns;
DROP TABLE IF EXISTS order_lines;
DROP TABLE IF EXISTS orders;

-- ------------------------------------------------------------------- Rôles
INSERT INTO roles (code, name, permissions) VALUES
 ('DEPOT', 'Dépôt / magasin',
  '["reference","receipt","transfer","loss","inventory","costs","reports","documents"]')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, permissions = EXCLUDED.permissions;

-- Permissions ajustées : plus de « order » ni de « return » ; le pharmacien
-- tient la vente et reçoit les transferts.
UPDATE roles SET permissions =
  '["reference","receipt","transfer","sale","loss","inventory","prices","costs","settings","users","audit","reports","cancel","documents"]'
  WHERE code = 'ADMIN';
UPDATE roles SET permissions =
  '["reference","transfer","sale","loss","inventory","prices","costs","audit","reports","cancel","documents"]'
  WHERE code = 'PHARMACIST';

-- Les rôles STOCK et SELLER disparaissent — sauf si des comptes les utilisent
-- encore (dans ce cas ils sont conservés mais sans aucun droit, pour ne pas
-- casser l'historique ; les comptes concernés doivent être réaffectés).
DO $$
DECLARE utilises INTEGER;
BEGIN
  SELECT COUNT(*) INTO utilises FROM users u
    JOIN roles r ON r.id = u.role_id WHERE r.code IN ('STOCK','SELLER');
  IF utilises = 0 THEN
    DELETE FROM roles WHERE code IN ('STOCK','SELLER');
  ELSE
    UPDATE roles SET name = name || ' (obsolète — réaffecter les comptes)', permissions = '[]'
      WHERE code IN ('STOCK','SELLER');
    RAISE NOTICE '% compte(s) utilisent encore les rôles STOCK/SELLER : ils sont conservés sans droits.', utilises;
  END IF;
END $$;
