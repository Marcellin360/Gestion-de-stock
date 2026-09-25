-- ============================================================================
-- PharmaStock — Migration 001 : schéma complet de la base
-- Une table par entité du cahier des charges (§11), contraintes d'intégrité,
-- index de performance, journal immuable des mouvements/prix/audit.
-- PostgreSQL 14 et supérieur.
-- ============================================================================

-- ---------------------------------------------------------------- Utilisateurs
CREATE TABLE roles (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(20)  NOT NULL UNIQUE,
  name         VARCHAR(100) NOT NULL,
  permissions  JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE roles IS 'Rôles applicatifs et permissions associées (RG18)';

CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(150) NOT NULL,
  login          VARCHAR(80)  NOT NULL UNIQUE,
  password_hash  VARCHAR(120) NOT NULL,
  role_id        INTEGER      NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  active         BOOLEAN      NOT NULL DEFAULT TRUE,
  phone          VARCHAR(40),
  note           TEXT         NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_login_at  TIMESTAMPTZ
);

CREATE TABLE sessions (
  id          SERIAL PRIMARY KEY,
  token_hash  CHAR(64)    NOT NULL UNIQUE,
  user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf        CHAR(64)    NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip          VARCHAR(60),
  user_agent  VARCHAR(255)
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- ----------------------------------------------------------------- Paramètres
CREATE TABLE settings (
  id             INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pharmacy_name  VARCHAR(150) NOT NULL,
  address        TEXT         NOT NULL DEFAULT '',
  phone          VARCHAR(40)  NOT NULL DEFAULT '',
  manager_name   VARCHAR(150) NOT NULL DEFAULT '',
  currency       VARCHAR(10)  NOT NULL DEFAULT 'Ar',
  valuation      VARCHAR(10)  NOT NULL DEFAULT 'LOT'  CHECK (valuation IN ('LOT','CMP')),
  margin_mode    VARCHAR(10)  NOT NULL DEFAULT 'COST' CHECK (margin_mode IN ('COST','SALE')),
  min_margin     NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (min_margin >= 0 AND min_margin < 100),
  max_margin     NUMERIC(5,2) NOT NULL DEFAULT 30 CHECK (max_margin >= 0 AND max_margin < 100),
  expiry_days    INTEGER      NOT NULL DEFAULT 90 CHECK (expiry_days BETWEEN 1 AND 730),
  allow_expired_sale BOOLEAN  NOT NULL DEFAULT FALSE,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT settings_margin_order CHECK (min_margin <= max_margin)
);

-- -------------------------------------------------- Référentiels des médicaments
CREATE TABLE categories (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(150) NOT NULL UNIQUE,
  description  TEXT         NOT NULL DEFAULT '',
  active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(80)  NOT NULL UNIQUE,
  name          VARCHAR(200) NOT NULL,
  ingredient    VARCHAR(200) NOT NULL DEFAULT '',
  dosage        VARCHAR(100) NOT NULL DEFAULT '',
  form          VARCHAR(80)  NOT NULL DEFAULT '',
  presentation  VARCHAR(150) NOT NULL DEFAULT '',
  barcode       VARCHAR(255) UNIQUE,
  category_id   INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  manufacturer  VARCHAR(200) NOT NULL DEFAULT '',
  unit          VARCHAR(40)  NOT NULL DEFAULT 'boîte',
  min_stock     INTEGER      NOT NULL DEFAULT 5  CHECK (min_stock >= 0),
  max_stock     INTEGER      CHECK (max_stock IS NULL OR max_stock >= 0),
  storage       TEXT         NOT NULL DEFAULT '',
  note          TEXT         NOT NULL DEFAULT '',
  active        BOOLEAN      NOT NULL DEFAULT TRUE,
  margin_rate   NUMERIC(5,2) NOT NULL DEFAULT 20 CHECK (margin_rate >= 0 AND margin_rate < 100),
  selling_price NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  cmp           NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (cmp >= 0),
  version       INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT products_max_stock CHECK (max_stock IS NULL OR max_stock >= min_stock)
);
CREATE INDEX products_name_idx ON products (name);
CREATE INDEX products_active_idx ON products (active) WHERE active;
ALTER TABLE products ADD COLUMN search_text TEXT GENERATED ALWAYS AS (
  lower(code || ' ' || name || ' ' || ingredient || ' ' || COALESCE(barcode,'') || ' ' || manufacturer)
) STORED;
CREATE INDEX products_search_idx ON products USING gin (to_tsvector('simple', search_text));

CREATE TABLE suppliers (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  contact     VARCHAR(150) NOT NULL DEFAULT '',
  phone       VARCHAR(40)  NOT NULL DEFAULT '',
  email       VARCHAR(150) NOT NULL DEFAULT '',
  address     TEXT         NOT NULL DEFAULT '',
  nif         VARCHAR(40)  NOT NULL DEFAULT '',
  note        TEXT         NOT NULL DEFAULT '',
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX suppliers_name_idx ON suppliers (name);

-- ------------------------------------------------------- Approvisionnements
CREATE TABLE orders (
  id           SERIAL PRIMARY KEY,
  reference    VARCHAR(40)  NOT NULL UNIQUE,
  supplier_id  INTEGER      NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  user_id      INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status       VARCHAR(20)  NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIAL','RECEIVED','CLOSED')),
  note         TEXT         NOT NULL DEFAULT '',
  expected_on  DATE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  closed_at    TIMESTAMPTZ,
  closed_by    INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  close_reason TEXT
);
CREATE INDEX orders_supplier_idx ON orders (supplier_id);
CREATE INDEX orders_status_idx ON orders (status);

CREATE TABLE order_lines (
  id             SERIAL PRIMARY KEY,
  order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  received       INTEGER NOT NULL DEFAULT 0 CHECK (received >= 0),
  purchase_price NUMERIC(20,6) NOT NULL CHECK (purchase_price >= 0),
  CONSTRAINT order_lines_received CHECK (received <= quantity)
);
CREATE INDEX order_lines_order_idx ON order_lines (order_id);

CREATE TABLE receipts (
  id            SERIAL PRIMARY KEY,
  reference     VARCHAR(40) NOT NULL UNIQUE,
  order_id      INTEGER REFERENCES orders(id) ON DELETE RESTRICT,
  supplier_id   INTEGER     NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  fees          NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (fees >= 0),
  cost_total    NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (cost_total >= 0),
  note          TEXT        NOT NULL DEFAULT '',
  invoice_ref   VARCHAR(80) NOT NULL DEFAULT '',
  status        VARCHAR(20) NOT NULL DEFAULT 'VALIDATED' CHECK (status IN ('VALIDATED','CANCELLED')),
  request_key   UUID        NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at  TIMESTAMPTZ,
  cancelled_by  INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  cancel_reason TEXT
);
CREATE INDEX receipts_supplier_idx ON receipts (supplier_id);
CREATE INDEX receipts_created_idx ON receipts (created_at);

CREATE TABLE receipt_lines (
  id             SERIAL PRIMARY KEY,
  receipt_id     INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  lot_id         INTEGER NOT NULL,
  order_line_id  INTEGER REFERENCES order_lines(id) ON DELETE SET NULL,
  number         VARCHAR(100) NOT NULL,
  quantity       INTEGER      NOT NULL CHECK (quantity > 0),
  purchase_price NUMERIC(20,6) NOT NULL CHECK (purchase_price >= 0),
  allocated_fees NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (allocated_fees >= 0),
  unit_cost      NUMERIC(20,6) NOT NULL CHECK (unit_cost >= 0),
  received_on    DATE         NOT NULL,
  expires_on     DATE,
  manufactured_on DATE,
  CONSTRAINT receipt_lines_dates CHECK (manufactured_on IS NULL OR expires_on IS NULL OR manufactured_on <= expires_on)
);
CREATE INDEX receipt_lines_receipt_idx ON receipt_lines (receipt_id);
CREATE INDEX receipt_lines_lot_idx ON receipt_lines (lot_id);

-- ------------------------------------------------------------------------ Lots
CREATE TABLE lots (
  id                SERIAL PRIMARY KEY,
  product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  supplier_id       INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  number            VARCHAR(100) NOT NULL,
  received_on       DATE         NOT NULL,
  manufactured_on   DATE,
  expires_on        DATE,
  quantity          INTEGER      NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  received_quantity INTEGER      NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  purchase_price    NUMERIC(20,6) NOT NULL CHECK (purchase_price >= 0),
  allocated_fees    NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (allocated_fees >= 0),
  unit_cost         NUMERIC(20,6) NOT NULL CHECK (unit_cost >= 0),
  status            VARCHAR(20)  NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','BLOCKED')),
  block_reason      TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (product_id, supplier_id, number),
  CONSTRAINT lots_dates CHECK (manufactured_on IS NULL OR expires_on IS NULL OR manufactured_on <= expires_on)
);
CREATE INDEX lots_product_idx ON lots (product_id);
CREATE INDEX lots_expiry_idx ON lots (expires_on);
CREATE INDEX lots_available_idx ON lots (product_id, expires_on) WHERE status = 'AVAILABLE' AND quantity > 0;

-- La table receipt_lines précède lots : la clé étrangère est ajoutée après création.
ALTER TABLE receipt_lines ADD CONSTRAINT receipt_lines_lot_fk
  FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------------ Mouvements
CREATE TABLE movements (
  id            SERIAL PRIMARY KEY,
  document_type VARCHAR(20) NOT NULL CHECK (document_type IN ('RECEIPT','SALE','LOSS','RETURN','ADJUSTMENT','CANCEL')),
  document_id   INTEGER     NOT NULL,
  product_id    INTEGER     NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  lot_id        INTEGER     NOT NULL REFERENCES lots(id) ON DELETE RESTRICT,
  quantity      INTEGER     NOT NULL CHECK (quantity <> 0),
  unit_cost     NUMERIC(20,6) NOT NULL CHECK (unit_cost >= 0),
  kind          VARCHAR(30) NOT NULL,
  reason        TEXT        NOT NULL DEFAULT '',
  user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX movements_document_idx ON movements (document_type, document_id);
CREATE INDEX movements_lot_idx ON movements (lot_id, id);
CREATE INDEX movements_product_idx ON movements (product_id, id);
CREATE INDEX movements_created_idx ON movements (created_at);

-- ----------------------------------------------------------------------- Ventes
CREATE TABLE sales (
  id            SERIAL PRIMARY KEY,
  reference     VARCHAR(40) NOT NULL UNIQUE,
  user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  customer_name VARCHAR(150) NOT NULL DEFAULT '',
  total         NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (total >= 0),
  cost_total    NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (cost_total >= 0),
  margin        NUMERIC(20,6) NOT NULL DEFAULT 0,
  note          TEXT        NOT NULL DEFAULT '',
  status        VARCHAR(20) NOT NULL DEFAULT 'VALIDATED' CHECK (status IN ('VALIDATED','CANCELLED')),
  request_key   UUID        NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at  TIMESTAMPTZ,
  cancelled_by  INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  cancel_reason TEXT
);
CREATE INDEX sales_created_idx ON sales (created_at);
CREATE INDEX sales_user_idx ON sales (user_id);

CREATE TABLE sale_lines (
  id          SERIAL PRIMARY KEY,
  sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  lot_id      INTEGER NOT NULL REFERENCES lots(id) ON DELETE RESTRICT,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(20,6) NOT NULL CHECK (unit_price >= 0),
  unit_cost   NUMERIC(20,6) NOT NULL CHECK (unit_cost >= 0),
  margin_rate NUMERIC(5,2)  NOT NULL,
  margin      NUMERIC(20,6) NOT NULL
);
CREATE INDEX sale_lines_sale_idx ON sale_lines (sale_id);
CREATE INDEX sale_lines_lot_idx ON sale_lines (lot_id);

-- ------------------------------------------------- Pertes, casse, expiration
CREATE TABLE losses (
  id            SERIAL PRIMARY KEY,
  reference     VARCHAR(40) NOT NULL UNIQUE,
  user_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason        VARCHAR(40) NOT NULL CHECK (reason IN ('Casse','Détérioration','Expiration','Perte','Don','Rappel')),
  note          TEXT        NOT NULL DEFAULT '',
  cost_total    NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (cost_total >= 0),
  status        VARCHAR(20) NOT NULL DEFAULT 'VALIDATED' CHECK (status IN ('VALIDATED','CANCELLED')),
  request_key   UUID        NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at  TIMESTAMPTZ,
  cancelled_by  INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  cancel_reason TEXT
);
CREATE INDEX losses_created_idx ON losses (created_at);

CREATE TABLE loss_lines (
  id         SERIAL PRIMARY KEY,
  loss_id    INTEGER NOT NULL REFERENCES losses(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  lot_id     INTEGER NOT NULL REFERENCES lots(id) ON DELETE RESTRICT,
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost  NUMERIC(20,6) NOT NULL CHECK (unit_cost >= 0)
);
CREATE INDEX loss_lines_loss_idx ON loss_lines (loss_id);

-- ------------------------------------------------------- Retours fournisseurs
CREATE TABLE supplier_returns (
  id             SERIAL PRIMARY KEY,
  reference      VARCHAR(40) NOT NULL UNIQUE,
  supplier_id    INTEGER     NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  user_id        INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason         TEXT        NOT NULL,
  note           TEXT        NOT NULL DEFAULT '',
  cost_total     NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (cost_total >= 0),
  status         VARCHAR(20) NOT NULL DEFAULT 'VALIDATED' CHECK (status IN ('VALIDATED','CANCELLED')),
  return_status  VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (return_status IN ('PENDING','ACCEPTED','REPLACED','REFUNDED','REJECTED')),
  credit_ref     VARCHAR(80) NOT NULL DEFAULT '',
  request_key    UUID        NOT NULL UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at   TIMESTAMPTZ,
  cancelled_by   INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  cancel_reason  TEXT
);
CREATE INDEX supplier_returns_supplier_idx ON supplier_returns (supplier_id);

CREATE TABLE supplier_return_lines (
  id         SERIAL PRIMARY KEY,
  return_id  INTEGER NOT NULL REFERENCES supplier_returns(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  lot_id     INTEGER NOT NULL REFERENCES lots(id) ON DELETE RESTRICT,
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost  NUMERIC(20,6) NOT NULL CHECK (unit_cost >= 0)
);
CREATE INDEX supplier_return_lines_return_idx ON supplier_return_lines (return_id);

-- ------------------------------------------------------------------- Inventaire
CREATE TABLE inventories (
  id           SERIAL PRIMARY KEY,
  reference    VARCHAR(40) NOT NULL UNIQUE,
  user_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  scope        VARCHAR(200) NOT NULL DEFAULT '',
  note         TEXT        NOT NULL DEFAULT '',
  status       VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VALIDATED','ABANDONED','CANCELLED')),
  lines_count  INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at TIMESTAMPTZ,
  validated_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  adjustment_id INTEGER
);
CREATE INDEX inventories_status_idx ON inventories (status);

CREATE TABLE inventory_lines (
  id              SERIAL PRIMARY KEY,
  inventory_id    INTEGER NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  lot_id          INTEGER NOT NULL REFERENCES lots(id) ON DELETE RESTRICT,
  theoretical     INTEGER NOT NULL CHECK (theoretical >= 0),
  physical        INTEGER CHECK (physical IS NULL OR physical >= 0),
  gap             INTEGER GENERATED ALWAYS AS (CASE WHEN physical IS NULL THEN NULL ELSE physical - theoretical END) STORED,
  reason          TEXT    NOT NULL DEFAULT '',
  product_version INTEGER NOT NULL,
  counted_at      TIMESTAMPTZ
);
CREATE INDEX inventory_lines_inventory_idx ON inventory_lines (inventory_id);

CREATE TABLE adjustments (
  id           SERIAL PRIMARY KEY,
  reference    VARCHAR(40) NOT NULL UNIQUE,
  inventory_id INTEGER REFERENCES inventories(id) ON DELETE RESTRICT,
  user_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason       TEXT        NOT NULL DEFAULT '',
  note         TEXT        NOT NULL DEFAULT '',
  cost_total   NUMERIC(20,6) NOT NULL DEFAULT 0,
  status       VARCHAR(20) NOT NULL DEFAULT 'VALIDATED' CHECK (status IN ('VALIDATED','CANCELLED')),
  request_key  UUID        NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  cancelled_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  cancel_reason TEXT
);

CREATE TABLE adjustment_lines (
  id            SERIAL PRIMARY KEY,
  adjustment_id INTEGER NOT NULL REFERENCES adjustments(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  lot_id        INTEGER NOT NULL REFERENCES lots(id) ON DELETE RESTRICT,
  quantity      INTEGER NOT NULL CHECK (quantity <> 0),
  unit_cost     NUMERIC(20,6) NOT NULL CHECK (unit_cost >= 0),
  gap_reason    TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX adjustment_lines_adjustment_idx ON adjustment_lines (adjustment_id);
ALTER TABLE inventories ADD CONSTRAINT inventories_adjustment_fk
  FOREIGN KEY (adjustment_id) REFERENCES adjustments(id) ON DELETE RESTRICT;

-- -------------------------------------------------------- Coûts, prix, audit
CREATE TABLE price_history (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  cost        NUMERIC(20,6) NOT NULL CHECK (cost >= 0),
  rate        NUMERIC(5,2)  NOT NULL,
  price       NUMERIC(20,6) NOT NULL CHECK (price >= 0),
  mode        VARCHAR(10)   NOT NULL CHECK (mode IN ('COST','SALE')),
  origin      VARCHAR(60)   NOT NULL DEFAULT '',
  reason      VARCHAR(255)  NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX price_history_product_idx ON price_history (product_id, id);

CREATE TABLE audit_logs (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  action     VARCHAR(80) NOT NULL,
  entity     VARCHAR(80) NOT NULL,
  entity_id  INTEGER,
  before     JSONB,
  after      JSONB,
  ip         VARCHAR(60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity, entity_id);

-- ------------------------------------------------------- Journaux immuables
CREATE FUNCTION reject_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Journal immuable : modification ou suppression interdite (%).', TG_TABLE_NAME;
END; $$;

CREATE TRIGGER movements_immutable BEFORE UPDATE OR DELETE ON movements
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER price_history_immutable BEFORE UPDATE OR DELETE ON price_history
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

-- --------------------------------------------------- Sécurité: pas de suppression
-- Une opération validée ne se supprime jamais : on annule en laissant une trace (RG19).
CREATE FUNCTION reject_validated_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'VALIDATED' THEN
    RAISE EXCEPTION 'Opération validée : suppression interdite, utiliser l''annulation tracée (RG19).';
  END IF;
  RETURN OLD;
END; $$;

CREATE TRIGGER receipts_no_delete BEFORE DELETE ON receipts FOR EACH ROW EXECUTE FUNCTION reject_validated_delete();
CREATE TRIGGER sales_no_delete BEFORE DELETE ON sales FOR EACH ROW EXECUTE FUNCTION reject_validated_delete();
CREATE TRIGGER losses_no_delete BEFORE DELETE ON losses FOR EACH ROW EXECUTE FUNCTION reject_validated_delete();
CREATE TRIGGER returns_no_delete BEFORE DELETE ON supplier_returns FOR EACH ROW EXECUTE FUNCTION reject_validated_delete();
CREATE TRIGGER adjustments_no_delete BEFORE DELETE ON adjustments FOR EACH ROW EXECUTE FUNCTION reject_validated_delete();

-- ------------------------------------------- Vues de lecture (rapports, stock)
CREATE VIEW v_lot_state AS
SELECT l.id, l.product_id, p.code AS product_code, p.name AS product_name, p.unit,
       l.supplier_id, s.name AS supplier_name, l.number, l.received_on, l.expires_on,
       l.quantity, l.received_quantity, l.purchase_price, l.allocated_fees, l.unit_cost,
       l.status,
       COALESCE(SUM(m.quantity), 0) AS movement_balance
FROM lots l
JOIN products p ON p.id = l.product_id
JOIN suppliers s ON s.id = l.supplier_id
LEFT JOIN movements m ON m.lot_id = l.id
GROUP BY l.id, p.id, s.id;

COMMENT ON VIEW v_lot_state IS 'État des lots : quantité théorique vs somme des mouvements (contrôle d''intégrité)';
