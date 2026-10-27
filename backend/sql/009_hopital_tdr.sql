-- ==========================================================================
-- 2.7.36 — HÔPITAL, volet 2 : tour de garde PAR PÉRIODES + séjour du patient
--
--   1. staff_duties : un employé peut avoir UNE OU PLUSIEURS PÉRIODES de
--      garde, chacune = date de début → date de fin (comprises). Les périodes
--      peuvent se chevaucher ; l'écran « Tour de garde » et la caisse les
--      lisent ensemble.
--   2. patients.admitted_on : la DATE D'ADMISSION à l'hôpital (par défaut le
--      jour d'enregistrement) — c'est le début de son « séjour ».
--   3. patients.created_by : l'EMPLOYÉ qui a enregistré le patient (la liste
--      l'affiche à la place de la remarque, demande de l'officine).
--
-- RG19 : rien n'est supprimé ; les anciens duty_day (jours de semaine) restent
-- en place et continuent de compter tant que la fiche les affiche.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS staff_duties (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id   INTEGER NOT NULL REFERENCES medical_staff(id),
  start_on   DATE    NOT NULL,
  end_on     DATE    NOT NULL,
  note       VARCHAR(120) NOT NULL DEFAULT '',
  created_by INTEGER NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT staff_duties_dates_ok CHECK (end_on >= start_on)
);

ALTER TABLE patients ADD COLUMN IF NOT EXISTS admitted_on DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS created_by INTEGER NULL REFERENCES users(id);