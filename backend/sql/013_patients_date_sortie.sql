-- ============================================================================
-- 2.7.59 — DATE DE SORTIE DE L'HÔPITAL : la « Sortie du service » d'un
-- patient grave sa date, qui figure alors sur ses ORDONNANCES
-- (« Sorti de l'hôpital le … » — demande de l'officine).
-- Gravée automatiquement quand « actif » passe à faux ; effacée si le
-- patient revient au service (« actif » repasse à vrai).
--
-- ⚠  Après avoir recopié ce fichier :  npm run db:migrate
-- ============================================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS discharged_on DATE;