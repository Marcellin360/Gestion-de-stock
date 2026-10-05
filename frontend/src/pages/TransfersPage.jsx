// Historique de transfert (2.7.11 — nouveau titre du menu « Transferts dépôt →
// pharmacie ») : l'écran qui remplace les commandes et les retours. Il montre
// ce qui est passé de la réserve au comptoir, quand, par qui et pour quel
// motif — avec le détail complet de chaque transfert (bouton « Détail »).
//
// 2.7.8 — le bouton « Bordereau » est retiré : tout se fait depuis « Détail »,
// qui ouvre une boîte de dialogue (date, valeur, lots, bouton Télécharger).
import { useCallback, useMemo, useState } from 'react';
import { ArrowRightLeft, Eye } from 'lucide-react';
import { stock } from '../api/endpoints.js';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Modal, Select, Table } from '../components/ui.jsx';
import DocumentModal from '../components/DocumentModal.jsx';
import TransferForm from '../forms/TransferForm.jsx';
import { dateTime, integer, money } from '../utils/format.js';

export default function TransfersPage() {
  const { documents, refresh } = useData();
  // 2.7.20 — le profil sert à masquer « Nouveau transfert » côté pharmacie.
  const { can, user } = useAuth();
  const toast = useToast();
  const [creation, setCreation] = useState(false);
  const [detail, setDetail] = useState(null);
  const [filtres, setFiltres] = useState({ mois: '', terme: '' });
  const [error, setError] = useState(null);

  // Toutes les lignes « transfert » des documents récents, les plus récents d'abord.
  const transferts = useMemo(() => documents
    .filter(doc => doc.kind === 'TRANSFER')
    .filter(doc => (filtres.terme ? `${doc.reference} ${doc.reason}`.toLowerCase().includes(filtres.terme.toLowerCase()) : true))
    .filter(doc => {
      if (!filtres.mois) return true;
      const cle = String(doc.date).slice(0, 7);
      return cle === filtres.mois;
    }), [documents, filtres]);

  const valides = transferts.filter(doc => doc.status === 'VALIDATED');
  const valeurTotale = valides.reduce((somme, doc) => somme + Number(doc.costTotal || 0), 0);

  const ouvert = transfert => {
    setError(null);
    setDetail(transfert);
  };

  // L'API renvoie { transfer, lines } : le transfert (en-tête) et ses lignes déjà
  // mises en forme (médicament, lot, quantité, coût unitaire, valeur).
  const chargerDetail = useCallback(async () => {
    const { transfer, lines } = await stock.transfer(detail.id);
    return {
      reference: transfer.reference,
      type: 'Transfert dépôt → pharmacie',
      date: transfer.createdAt || transfer.date,
      statut: transfer.status === 'VALIDATED' ? 'validé' : 'annulé',
      total: transfer.costTotal,
      imprimable: `/documents/TRANSFER/${transfer.id}/print`,
      infos: [
        { label: 'Sens', valeur: 'Dépôt (réserve) → Pharmacie (comptoir)' },
        { label: 'Motif', valeur: transfer.reason || '—' },
        { label: 'Remarque', valeur: transfer.note || '—' }
      ],
      lignes: (lines || []).map(ligne => ({
        product: ligne.product,
        code: ligne.code === '—' ? '' : ligne.code,
        lot: ligne.lot,
        expiresOn: ligne.expiresOn,
        quantity: ligne.quantity,
        unitCost: ligne.unitCost,
        value: ligne.value
      }))
    };
  }, [detail?.id]);

  return (
    <>
      <Card title={`Historique de transfert — ${transferts.length} transfert(s) dépôt → pharmacie`}
        actions={<>
          <Badge tone="info">Valeur transférée : {money(valeurTotale)}</Badge>
          {/* 2.7.20 — le seed donne la permission 'transfer' à la pharmacie aussi,
              mais « Nouveau transfert » n'a de sens qu'au DÉPÔT : le bouton est
              MASQUÉ côté pharmacie (sur le Pharmacie ihany), l'historique reste. */}
          {can('transfer') && user?.roleCode !== 'PHARMACIST' ? (
            <Btn variant="primary" icon={ArrowRightLeft} onClick={() => setCreation(true)}>Nouveau transfert</Btn>
          ) : null}
        </>}>
        <ErrorBox error={error} />

        <div className="inline-form" style={{ marginBottom: 12 }}>
          <Field label="Mois">
            <Select value={filtres.mois} onChange={e => setFiltres({ ...filtres, mois: e.target.value })}>
              <option value="">Tous les mois affichés</option>
              {[...new Set(documents.filter(d => d.kind === 'TRANSFER').map(d => String(d.date).slice(0, 7)))].sort().reverse()
                .map(mois => <option key={mois} value={mois}>{mois}</option>)}
            </Select>
          </Field>
          <Field label="Recherche">
            <input value={filtres.terme} onChange={e => setFiltres({ ...filtres, terme: e.target.value })}
              placeholder="Référence ou motif (ex. TRF-2026, réassort)" />
          </Field>
        </div>

        {transferts.length === 0 ? (
          <Empty>
            Aucun transfert enregistré. Le dépôt approvisionne la pharmacie avec le bouton « Nouveau transfert » :
            la marchandise reçue entre d’abord au dépôt, puis rejoint le comptoir selon ses besoins.
          </Empty>
        ) : (
          <Table columns={[
            { label: 'Référence' }, { label: 'Motif' }, { label: 'Date' },
            { label: 'Valeur', num: true }, { label: 'État' }, { label: '' }
          ]}>
            {transferts.map(transfert => (
              <tr key={transfert.id}>
                <td><strong>{transfert.reference}</strong>
                  <div className="muted" style={{ fontSize: '.78rem' }}>Dépôt → Pharmacie</div>
                </td>
                <td className="wrap">{transfert.reason}</td>
                <td>{dateTime(transfert.date)}</td>
                <td className="num">{money(transfert.costTotal)}</td>
                <td>{transfert.status === 'VALIDATED'
                  ? <Badge tone="ok">validé</Badge>
                  : <Badge tone="danger">annulé</Badge>}</td>
                <td className="right nowrap">
                  <Btn variant="ghost" icon={Eye} onClick={() => ouvert(transfert)}>Détail</Btn>
                </td>
              </tr>
            ))}
          </Table>
        )}

        <p className="muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
          Le stock du dépôt diminue et celui de la pharmacie augmente en une seule opération, tracée dans les
          mouvements de stock. Un transfert annulé remet les quantités dans le dépôt. « Détail » affiche le
          bordereau dans une fenêtre, avec téléchargement immédiat.
        </p>
      </Card>

      {creation ? (
        <Modal title="Nouveau transfert — dépôt vers pharmacie" onClose={() => setCreation(false)} wide>
          <TransferForm onCancel={() => setCreation(false)} onDone={async transfert => {
            toast.success(`Transfert ${transfert.reference} validé : la marchandise est entrée en pharmacie.`);
            setCreation(false);
            await refresh();
          }} />
        </Modal>
      ) : null}

      {detail ? (
        <DocumentModal titre={`Transfert ${detail.reference || ''}`.trim()}
          charger={chargerDetail} onClose={() => setDetail(null)} />
      ) : null}
    </>
  );
}