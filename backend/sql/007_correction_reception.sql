-- ============================================================================
-- 007 — 2.7.34, teboka ③ : CORRECTION D'UNE RÉCEPTION (workflow dépôt → admin)
--
-- Une réception VALIDÉE mais erronée (mauvaise quantité, prix, dates, lot…)
-- ne peut PAS être modifiée de force : le dépôt dépose une DEMANDE de
-- correction (motif + nouvelles valeurs) et seul un ADMINISTRATEUR l'applique
-- ou la refuse. La réception ne change qu'à la validation, et seulement tant
-- qu'aucun de ses lots n'a bougé (transfert / vente / perte / inventaire /
-- complétage) — sinon le chemin est l'annulation tracée du document (RG19).
--
-- Chaque demande garde : l'état proposé (payload JSONB), le motif, le
-- proposant, la décision et le décideur — traçabilité complète (§12).
-- ============================================================================
CREATE TABLE IF NOT EXISTS receipt_corrections (
  id            SERIAL       PRIMARY KEY,
  reference     VARCHAR(40)  NOT NULL,
  receipt_id    INTEGER      NOT NULL REFERENCES receipts(id),
  proposed_by   INTEGER      NOT NULL REFERENCES users(id),
  payload       JSONB        NOT NULL,           -- {supplierId, fees, note, lines[…]}
  reason        TEXT         NOT NULL,           -- motif de la correction (dépôt)
  status        VARCHAR(10)  NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'VALIDATED', 'REFUSED')),
  decided_by    INTEGER      REFERENCES users(id),
  decision_note TEXT         NOT NULL DEFAULT '',
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE receipt_corrections
  ADD CONSTRAINT receipt_corrections_reference_unique UNIQUE (reference);

-- Il ne peut exister qu'UNE demande en attente par réception (garde-fou
-- applicatif renforcé par un index partiel unique).
CREATE UNIQUE INDEX IF NOT EXISTS receipt_corrections_pending_receipt_idx
  ON receipt_corrections (receipt_id) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS receipt_corrections_receipt_idx
  ON receipt_corrections (receipt_id);
CREATE INDEX IF NOT EXISTS receipt_corrections_status_idx
  ON receipt_corrections (status);

COMMENT ON TABLE receipt_corrections IS 'Demandes de correction de réception : proposées au dépôt, tranchées par un administrateur (teboka ③, 2.7.34).';