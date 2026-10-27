-- ============================================================================
-- 008 — HÔPITAL-PHARMACIE (2.7.35) : carnet du docteur/sage-femme à la
-- pharmacie, tour de garde (TDR), ordonnance pour le patient hospitalisé.
--
--   • medical_staff : personnel soignant qui amène le carnet (médecin ou
--     sage-femme), avec son jour de TDR dans la semaine ;
--   • patients : patients hospitalisés (pas les clients de passage) ;
--   • la VENTE peut porter le patient et le prescripteur : même stock
--     (délivrance au comptoir en FEFO), mais un DOCUMENT DIFFÉRENT —
--     l'ORDONNANCE — au lieu du simple ticket.
-- ============================================================================
CREATE TABLE medical_staff (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL UNIQUE,
  role        VARCHAR(20)  NOT NULL CHECK (role IN ('DOCTOR','MIDWIFE')),
  duty_day    SMALLINT NULL CHECK (duty_day IS NULL OR (duty_day BETWEEN 0 AND 6)),
  phone       VARCHAR(40) NOT NULL DEFAULT '',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE patients (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(180) NOT NULL,
  service     VARCHAR(120) NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX patients_name_idx ON patients (name);

-- Lien vente → patient / prescripteur (TOUS NULLABLE : une vente au comptoir
-- ordinaire ne change absolument pas).
ALTER TABLE sales
  ADD COLUMN patient_id INTEGER NULL REFERENCES patients(id) ON UPDATE CASCADE,
  ADD COLUMN medical_staff_id INTEGER NULL REFERENCES medical_staff(id) ON UPDATE CASCADE;
CREATE INDEX sales_patient_idx ON sales (patient_id);
CREATE INDEX sales_staff_idx ON sales (medical_staff_id);