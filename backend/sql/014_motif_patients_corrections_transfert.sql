-- ============================================================================
-- 014 — 2.7.79 : MOTIF D'HOSPITALISATION + CORRECTION DES TRANSFERTS
--
-- Deux demandes de l'officine :
--
--  1) PATIENTS : un champ « motif » (raison de l'entrée à l'hôpital, ex.
--     « Fièvre ») — renseigné à la fiche patient, visible dans la liste et
--     imprimé sur les ordonnances de séjour.
--  2) TRANSFERTS : comme les réceptions (007, teboka ③), un transfert VALIDÉ
--     mais erroné ne se modifie pas de force : le dépôt dépose une DEMANDE de
--     correction (motif + nouvelles quantités) ; seul un ADMINISTRATEUR
--     l'applique ou la refuse. La demande n'aboutit que si aucun lot touché
--     par le transfert n'a bougé depuis (vente, perte, inventaire, autre
--     transfert) — sinon le chemin est l'annulation tracée du document.
--
-- ⚠  Après avoir recopié ce fichier :  npm run db:migrate
-- ============================================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS motif TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS transfer_corrections (
  id            SERIAL       PRIMARY KEY,
  reference     VARCHAR(40)  NOT NULL,
  transfer_id   INTEGER      NOT NULL REFERENCES transfers(id),
  proposed_by   INTEGER      NOT NULL REFERENCES users(id),
  payload       JSONB        NOT NULL,           -- {transferReason, note, lines[{lotId,quantity}]}
  reason        TEXT         NOT NULL,           -- motif de la correction (dépôt)
  status        VARCHAR(10)  NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'VALIDATED', 'REFUSED')),
  decided_by    INTEGER      REFERENCES users(id),
  decision_note TEXT         NOT NULL DEFAULT '',
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE transfer_corrections
  ADD CONSTRAINT transfer_corrections_reference_unique UNIQUE (reference);

-- Il ne peut exister qu'UNE demande en attente par transfert (garde-fou
-- applicatif renforcé par un index partiel unique).
CREATE UNIQUE INDEX IF NOT EXISTS transfer_corrections_pending_transfer_idx
  ON transfer_corrections (transfer_id) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS transfer_corrections_transfer_idx
  ON transfer_corrections (transfer_id);
CREATE INDEX IF NOT EXISTS transfer_corrections_status_idx
  ON transfer_corrections (status);

COMMENT ON TABLE transfer_corrections IS
  'Demandes de correction de transfert : proposées au dépôt, tranchées par un administrateur (2.7.79).';
COMMENT ON COLUMN patients.motif IS
  '2.7.79 — motif de l’hospitalisation (ex. « Fièvre »), saisi à la fiche patient.';