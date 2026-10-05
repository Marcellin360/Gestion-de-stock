-- ============================================================================
-- 004 — BASE DU PRIX DE VENTE (2.7.8)
--
-- Jusqu'ici le prix de vente suivait le coût du dernier lot reçu : deux livraisons
-- du même médicament à des prix différents donnaient donc deux prix différents, et
-- le CMP affiché ne servait à rien. Cette migration ajoute le réglage qui choisit
-- la base du prix :
--
--   • 'CMP' (défaut) : prix = CMP × (1 + taux/100)
--                      → 100 boîtes à 1 000 Ar + 80 boîtes à 2 000 Ar :
--                        CMP = (100×1000 + 80×2000) / 180 = 1 444,444444 Ar
--                        prix = 1 444,444444 × 1,2 = 1 733,333333 Ar
--   • 'LOT'          : prix = coût de revient du DERNIER lot reçu (ancien comportement)
--
-- Le réglage est modifiable depuis l'écran « Paramètres » ; il ne change RIEN à la
-- valorisation du stock (le coût de sortie reste celui du lot réellement vendu).
-- ============================================================================

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS pricing_basis VARCHAR(10) NOT NULL DEFAULT 'CMP';

-- Les installations existantes gardent leurs prix actuels : on renseigne le défaut
-- avant que l'application ne recalcule (au prochain réglage ou à la prochaine réception).
UPDATE settings SET pricing_basis = 'CMP' WHERE pricing_basis IS NULL;