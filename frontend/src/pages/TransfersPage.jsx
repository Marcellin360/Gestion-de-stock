// Transferts dépôt → pharmacie : l'écran qui remplace les commandes et les
// retours. Il montre ce qui est passé de la réserve au comptoir, quand, par qui
// et pour quel motif. C'est l'historique du dépôt côté entrées/sorties.
import { useMemo, useState } from 'react';
import { ArrowRightLeft, Printer, Eye } from 'lucide-react';
import { openPrintable } from '../api/client.js';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Modal, Select, Table } from '../components/ui.jsx';
import TransferForm from '../forms/TransferForm.jsx';
import { dateTime, integer, money } from '../utils/format.js';

export default function TransfersPage() {
  const { documents, refresh } = useData();
  const { can } = useAuth();
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

  const lignesDetail = detail
    ? (detail.lines || []).map(ligne => ({
      produit: ligne.product || `Médicament #${ligne.productId}`,
      lot: ligne.lot,
      quantity: ligne.quantity,
      expiration: ligne.expiresOn || '—',
      valeur: ligne.value
    }))
    : [];

  return (
    <>
      <Card title={`${transferts.length} transfert(s) — dépôt vers pharmacie`}
        actions={<>
          <Badge tone="info">Valeur transférée : {money(valeurTotale)}</Badge>
          {can('transfer') ? (
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
                  <Btn variant="ghost" icon={Eye} onClick={async () => {
                    setError(null);
                    try {
                      const { stock } = await import('../api/endpoints.js');
                      setDetail(await stock.transfer(transfert.id));
                    } catch (cause) { setError(cause); }
                  }}>Détail</Btn>
                  <Btn variant="ghost" icon={Printer}
                    onClick={() => openPrintable(`/documents/TRANSFER/${transfert.id}/print`)}>Bordereau</Btn>
                </td>
              </tr>
            ))}
          </Table>
        )}

        <p className="muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
          Le stock du dépôt diminue et celui de la pharmacie augmente en une seule opération, tracée dans les
          mouvements de stock. Un transfert annulé remet les quantités dans le dépôt.
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
        <Modal title={`Transfert ${detail.reference || ''}`} onClose={() => setDetail(null)} wide>
          <div className="grid grid--2" style={{ marginBottom: 10 }}>
            <div><strong>Date :</strong> {dateTime(detail.date)}</div>
            <div><strong>Motif :</strong> {detail.reason}</div>
            <div><strong>Remarque :</strong> {detail.note || '—'}</div>
            <div><strong>Valeur :</strong> {money(detail.costTotal)}</div>
          </div>
          <Table columns={[
            { label: 'Médicament' }, { label: 'Lot' }, { label: 'Expiration' },
            { label: 'Quantité', num: true }, { label: 'Valeur', num: true }
          ]}>
            {lignesDetail.map((ligne, index) => (
              <tr key={index}>
                <td className="wrap">{ligne.produit}</td>
                <td>{ligne.lot}</td>
                <td>{ligne.expiration}</td>
                 <td className="num">{integer(ligne.quantity)}</td>
                <td className="num">{money(ligne.valeur)}</td>
              </tr>
            ))}
          </Table>
        </Modal>
      ) : null}
    </>
  );
}
