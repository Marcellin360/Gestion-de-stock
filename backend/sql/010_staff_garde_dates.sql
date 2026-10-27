-- ============================================================================
-- 2.7.38 — GARDE PAR PÉRIODE DE DATES SUR L'EMPLOYÉ
--   Le « jour de semaine (TDR) » disparaît : CHAQUE employé porte désormais
--   SA période de garde — une DATE DE DÉBUT et une DATE DE FIN obligatoires
--   (renseignées dans le formulaire « nouvel employé », visibles en liste).
--   L'ancienne colonne duty_day est laissée en base (inutilisée) pour ne pas
--   perdre de données historiques.
-- ============================================================================
ALTER TABLE medical_staff
  ADD COLUMN IF NOT EXISTS duty_start_on DATE,
  ADD COLUMN IF NOT EXISTS duty_end_on DATE;