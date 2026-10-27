-- ============================================================================
-- 2.7.49 — Fabriquant par LOT : le champ « Nom de Fabriquant » quitte la fiche
-- médicament et se saisit à la réception, lot par lot (à la place de
-- « Fabriqué le », qui sort du formulaire). Il suit le lot partout (transferts,
-- liste des réceptions, bon imprimé).
-- ============================================================================

ALTER TABLE lots
  ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(150) NOT NULL DEFAULT '';

ALTER TABLE receipt_lines
  ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(150) NOT NULL DEFAULT '';