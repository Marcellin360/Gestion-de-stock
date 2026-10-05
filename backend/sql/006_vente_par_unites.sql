-- ============================================================================
-- 006 — VENTE AU DÉTAIL : boîte ENTIÈRE, plaquette, ou vongany (2.7.12)
--
-- Demande du comptoir : le client peut acheter 1 boîte, 1 plaquette ou 1
-- vongany. Par exemple : boîte 1 = plaquette 10, plaquette 1 = vongany 10
-- (« matetika » dia 10/10, mais chaque médicament peut régler ses nombres).
-- Les 3 prix sont INDÉPENDANTS : le prix d'1 plaquette n'est PAS forcément
-- le prix d'1 boîte ÷ 10 (il est souvent un peu plus cher au détail).
--
-- Ce qui change en base :
--   1) products : + 4 colonnes de conditionnement et de prix au détail
--      (0 = vente au détail désactivée / prix non fixé → calcul automatique au
--      prorata du prix de la boîte au moment de la vente).
--   2) sale_lines : + 3 colonnes de traçabilité (l'unité vendue, le nombre
--      tapé à la caisse, le facteur de conversion) ; « quantity » reste
--      l'équivalent en unité de gestion (ex. 3 plaquettes = 0,3 boîte) pour
--      que TOUTES les valeurs (mouvements, marges, valorisation) restent
--      exactement comme avant.
--   3) quantity passe de INTEGER à NUMERIC(20,6) sur les lots, les mouvements
--      et les lignes de vente/inventaire/ajustement : vendre 1 plaquette
--      retire 0,1 boîte du stock — seuls ces champs voient des décimales.
--
-- Les réceptions, transferts et pertes restent en boîtes entières.
-- La migration est rejouable (IF NOT EXISTS / IF EXISTS partout).
-- ============================================================================

-- ------------------------------------------------------------------ products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS blisters_per_box  INTEGER NOT NULL DEFAULT 10
    CHECK (blisters_per_box >= 0),
  ADD COLUMN IF NOT EXISTS units_per_blister INTEGER NOT NULL DEFAULT 10
    CHECK (units_per_blister >= 0),
  ADD COLUMN IF NOT EXISTS price_per_blister NUMERIC(20,6) NOT NULL DEFAULT 0
    CHECK (price_per_blister >= 0),
  ADD COLUMN IF NOT EXISTS price_per_unit    NUMERIC(20,6) NOT NULL DEFAULT 0
    CHECK (price_per_unit >= 0);

-- Prix de départ : au prorata du prix de la boîte (modifiable ensuite dans la
-- fiche « Modifier » du médicament — les 3 prix sont alors indépendants).
UPDATE products
   SET price_per_blister = ROUND(selling_price / NULLIF(blisters_per_box, 0), 6)
 WHERE price_per_blister = 0
   AND blisters_per_box > 0
   AND selling_price > 0;

UPDATE products
   SET price_per_unit = ROUND(selling_price / NULLIF(blisters_per_box * units_per_blister, 0), 6)
 WHERE price_per_unit = 0
   AND blisters_per_box > 0
   AND units_per_blister > 0
   AND selling_price > 0;

-- ---------------------------------------------------------------- lots/moves
-- La vue v_lot_state s'appuie sur lots.quantity et movements.quantity : on la
-- dépose ici et on la recrée à la fin du script, sinon PostgreSQL refuse le
-- changement INTEGER → NUMERIC sur les colonnes qu'elle utilise.
DROP VIEW IF EXISTS v_lot_state;

ALTER TABLE lots
  ALTER COLUMN quantity SET DATA TYPE NUMERIC(20,6) USING quantity::numeric,
  ALTER COLUMN received_quantity SET DATA TYPE NUMERIC(20,6) USING received_quantity::numeric;

ALTER TABLE movements
  ALTER COLUMN quantity SET DATA TYPE NUMERIC(20,6) USING quantity::numeric;

-- ----------------------------------------------------------------- sale lines
ALTER TABLE sale_lines
  ADD COLUMN IF NOT EXISTS sale_unit     TEXT NOT NULL DEFAULT 'BOX'
    CHECK (sale_unit IN ('BOX', 'BLISTER', 'UNIT')),
  ADD COLUMN IF NOT EXISTS sale_quantity NUMERIC(24,6),
  ADD COLUMN IF NOT EXISTS unit_factor   INTEGER NOT NULL DEFAULT 1
    CHECK (unit_factor >= 1),
  ALTER COLUMN quantity SET DATA TYPE NUMERIC(20,6) USING quantity::numeric;

-- Les ventes déjà enregistrées étaient toutes au par boîte (facteur 1).
UPDATE sale_lines SET sale_quantity = quantity WHERE sale_quantity IS NULL;
ALTER TABLE sale_lines ALTER COLUMN sale_quantity SET NOT NULL;

-- ------------------------------------------------------------ inventaire/gap
-- La colonne « gap » est générée : on la recrée en décimale après le passage
-- de theoretical/physical à NUMERIC (les plaquettes entamées se comptent en
-- fractions de boîte, ex. 8,3 = 8 boîtes + 3 plaquettes).
ALTER TABLE inventory_lines DROP COLUMN IF EXISTS gap;

ALTER TABLE inventory_lines
  ALTER COLUMN theoretical SET DATA TYPE NUMERIC(20,6) USING theoretical::numeric,
  ALTER COLUMN physical    SET DATA TYPE NUMERIC(20,6) USING physical::numeric;

ALTER TABLE inventory_lines
  ADD COLUMN gap NUMERIC(24,6) GENERATED ALWAYS AS
    (CASE WHEN physical IS NULL THEN NULL ELSE physical - theoretical END) STORED;

ALTER TABLE adjustment_lines
  ALTER COLUMN quantity SET DATA TYPE NUMERIC(20,6) USING quantity::numeric;

-- La vue de contrôle d'intégrité, recréée une fois toutes les colonnes
-- NUMERIC en place (identique à celle de 001_schema.sql).
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