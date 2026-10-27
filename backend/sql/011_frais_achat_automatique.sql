-- ============================================================================
-- 2.7.47 — Frais d'achat AUTOMATIQUES : x % du prix d'achat, réglé dans
-- Paramètres (plus de champ « Frais » saisi à la réception), et mode de marge
-- unique « sur coût » : PV = coût × (1 + taux), la marge sur prix de vente
-- disparaît du paramétrage.
-- ============================================================================

-- Taux des frais appliqués automatiquement à chaque PA de réception
-- (10 % par défaut ; modifiable ensuite dans Paramètres → « Frais d'achat »).
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS fees_rate NUMERIC(5,2) NOT NULL DEFAULT 10;

-- Le mode de marge devient unique : sur coût (PV = coût × (1 + taux)).
-- Un paramétrage ancien en « marge sur prix de vente » bascule sur coût :
-- le prix de vente est recalculé par le serveur à la prochaine réception.
UPDATE settings SET margin_mode = 'COST' WHERE margin_mode <> 'COST';