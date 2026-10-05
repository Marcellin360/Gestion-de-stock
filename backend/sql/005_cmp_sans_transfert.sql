-- ============================================================================
-- 005 — LE TRANSFERT NE COMPTE PLUS DANS LE CMP
--
-- Problème trouvé en vérifiant les prix : le lot créé dans la PHARMACIE par un
-- transfert portait « received_quantity = quantité transférée ». Or le CMP se
-- calcule sur cette colonne (« tout ce qui est entré d'un fournisseur »).
-- Résultat : la même marchandise était comptée DEUX FOIS (une fois au dépôt à la
-- réception, une fois au comptoir au transfert), et le CMP dérivait à chaque
-- transfert — donc le prix de vente aussi, désormais qu'il suit le CMP.
--
--   Exemple constaté : CMP 1 347,826087 → 1 340,425532 après un transfert de 5.
--
-- Correctif : les lots du comptoir n'ont rien « reçu d'un fournisseur » (leur
-- received_quantity repasse à 0). La quantité en stock (quantity) n'est pas
-- touchée : elle reste portée par les mouvements de stock. Le code a été corrigé
-- en même temps (backend/src/services/transfer.service.js), cette migration ne
-- fait que remettre les données existantes d'aplomb, puis recalculer les prix.
-- ============================================================================

UPDATE lots
   SET received_quantity = 0
 WHERE location = 'PHARMACY'
   AND received_quantity > 0;

-- CMP recalculé sur les seules entrées fournisseur, puis prix de vente recalculé
-- avec le taux de marge de chaque fiche.
WITH cmp_calcule AS (
  SELECT product_id,
         ROUND(SUM(unit_cost * received_quantity) / NULLIF(SUM(received_quantity), 0), 6) AS cmp
    FROM lots
   WHERE received_quantity > 0
   GROUP BY product_id
)
UPDATE products p
   SET cmp = c.cmp,
       selling_price = CASE WHEN s.pricing_basis = 'LOT' THEN p.selling_price
                            WHEN s.margin_mode = 'SALE' THEN ROUND(c.cmp / (1 - p.margin_rate / 100), 6)
                            ELSE ROUND(c.cmp * (1 + p.margin_rate / 100), 6) END,
       updated_at = now()
  FROM cmp_calcule c, settings s
 WHERE s.id = 1
   AND p.id = c.product_id
   AND p.cmp <> c.cmp;