-- ============================================================================
-- 017 — 2.7.91 / 2.7.92 : REGISTRE NET (« safidy A ») — marque « superseded »
--       dans une TABLE SÉPARÉE, le journal des mouvements reste INTACT
--
-- Demande du dépôt : après une correction de transfert validée par l'admin,
-- la fiche de stock du dépôt montrait des colonnes gonflées (ex. transfert 30
-- corrigé en 20 : Entrées 50+30=80, Sorties 30+20=50) parce que l'annulation
-- tracée (+30) comptait comme une entrée. Désormais le registre lit chaque
-- document à sa VERSION FINALE, à SA DATE : Entrées 50 · Sorties 20 · Final 30.
--
-- ⚠ 2.7.92 — REPRISE DE LA MISE EN ŒUVRE. La première mouture (2.7.91)
--    ajoutait une colonne « superseded » sur « movements » et re-marquait le
--    passé par UPDATE : REFUSÉ par le trigger « movements_immutable »
--    (sql/001, RG19) — « Journal immuable : modification ou suppression
--    interdite ». Ce refus est JUSTE : un journal validé ne se retouche
--    JAMAIS, pas même pour un drapeau. La marque vit donc dans la table
--    séparée « movement_superseded » (INSERT seulement, une ligne par
--    mouvement exclu du registre). AUCUN UPDATE, AUCUN DELETE sur
--    « movements » : le rapport « Mouvements » et l'audit montrent toujours
--    TOUT ; seules les fiches de stock lisent la version finale.
--
-- Re-marquage du passé (INSERT … ON CONFLICT DO NOTHING : rejouable) :
--  ① corrections de transfert VALIDÉES : les contre-mouvements CANCEL et les
--    versions remplacées (tout ce qui précède la DERNIÈRE annulation tracée
--    de ce transfert) sont marqués. Limite assumée pour l'historique ancien :
--    la version corrigée pré-2.7.91 garde la date de sa validation (pas de
--    rétro-datation possible faute de date d'origine enregistrée) ; les
--    corrections validées APRÈS cette version sont rétro-datées au jour du
--    transfert (documentDate).
--  ② documents ANNULÉS (réception, transfert, vente, perte, ajustement) :
--    l'écriture d'origine et ses contre-mouvements sortent du registre.
--
-- ⚠ Après recopie du code : npm run db:migrate
--    (la 1re mouture avait échoué DANS UNE TRANSACTION : rien n'a été
--    appliqué, la base est restée intacte — cette 017 réécrite sera reprise
--    proprement par le prochain db:migrate.)
-- ============================================================================

-- Nettoie un éventuel vestige de la 1re mouture (normalement absente
-- partout : la migration avortée était transactionnelle).
ALTER TABLE movements DROP COLUMN IF EXISTS superseded;

-- Table de marquage « registre net » : INSERT uniquement. Une ligne =
-- un mouvement supplanté (version remplacée, contre-écriture CANCEL,
-- document annulé) que les fiches de stock n'affichent plus.
CREATE TABLE IF NOT EXISTS movement_superseded (
  movement_id INTEGER PRIMARY KEY REFERENCES movements(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ① corrections de transfert déjà validées : annulations tracées hors registre
INSERT INTO movement_superseded (movement_id)
SELECT m.id FROM movements m
 WHERE m.document_type = 'TRANSFER' AND m.kind = 'CANCEL'
   AND EXISTS (SELECT 1 FROM transfer_corrections tc
                WHERE tc.transfer_id = m.document_id AND tc.status = 'VALIDATED')
ON CONFLICT DO NOTHING;

-- ① suite : versions de transfert REMPLACÉES (antérieures à la dernière
-- annulation tracée d'une correction validée de ce transfert)
INSERT INTO movement_superseded (movement_id)
SELECT m.id FROM movements m
 WHERE m.document_type = 'TRANSFER' AND m.kind IN ('TRANSFER_OUT', 'TRANSFER_IN')
   AND m.created_at < (SELECT MAX(c.created_at) FROM movements c
                        WHERE c.document_type = 'TRANSFER' AND c.document_id = m.document_id
                          AND c.kind = 'CANCEL'
                          AND EXISTS (SELECT 1 FROM transfer_corrections tc
                                       WHERE tc.transfer_id = c.document_id AND tc.status = 'VALIDATED'))
ON CONFLICT DO NOTHING;

-- ② documents ANNULÉS (toutes natures) : écriture d'origine + annulations
INSERT INTO movement_superseded (movement_id)
SELECT m.id FROM movements m
 WHERE ( (m.document_type = 'RECEIPT'    AND EXISTS (SELECT 1 FROM receipts    d WHERE d.id = m.document_id AND d.status = 'CANCELLED'))
      OR (m.document_type = 'TRANSFER'   AND EXISTS (SELECT 1 FROM transfers   d WHERE d.id = m.document_id AND d.status = 'CANCELLED'))
      OR (m.document_type = 'SALE'       AND EXISTS (SELECT 1 FROM sales       d WHERE d.id = m.document_id AND d.status = 'CANCELLED'))
      OR (m.document_type = 'LOSS'       AND EXISTS (SELECT 1 FROM losses      d WHERE d.id = m.document_id AND d.status = 'CANCELLED'))
      OR (m.document_type = 'ADJUSTMENT' AND EXISTS (SELECT 1 FROM adjustments d WHERE d.id = m.document_id AND d.status = 'CANCELLED')) )
ON CONFLICT DO NOTHING;