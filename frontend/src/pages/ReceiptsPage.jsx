// Réceptions : entrée de marchandise, création des lots, frais répartis,
// recalcul du coût de revient (CMP) et du prix de vente.
//
// 2.7.8 — le bouton « Bon » devient « Détail » : le document s'ouvre dans une
// boîte de dialogue de l'application (et non dans un nouvel onglet) avec un
// bouton « Télécharger » immédiat.
import { useCallback, useState } from 'react';
import { PackagePlus, Eye } from 'lucide-react';
import { documents as documentsApi } from '../api/endpoints.js';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Modal, Table } from '../components/ui.jsx';
import DocumentModal from '../components/DocumentModal.jsx';
import ReceiptForm from '../forms/ReceiptForm.jsx';
import { dateTime, money } from '../utils/format.js';

export default function ReceiptsPage() {
  const { documents, productName, supplierName, lotNumber, refresh } = useData();
  const toast = useToast();
  const [creation, setCreation] = useState(false);
  // Détail ouvert : { id, ajustements } — les ajustements ne sont renseignés
  // qu'après une nouvelle réception (numéro de lot déjà utilisé).
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  const receptions = documents.filter(doc => doc.kind === 'RECEIPT');

  // Le contenu du détail vient de l'API : une seule source pour la liste et la
  // boîte de dialogue (quantités, coûts, dates d'expiration, mouvements).
  const chargerDetail = useCallback(async () => {
    const doc = await documentsApi.detail('RECEIPT', detail.id);
    return {
      reference: doc.reference,
      type: 'Réception (entrée au dépôt)',
      date: doc.date,
      statut: doc.status === 'VALIDATED' ? 'validé' : 'annulé',
      total: doc.costTotal,
      imprimable: `/documents/RECEIPT/${doc.id}/print`,
      infos: [
        { label: 'Fournisseur', valeur: supplierName(doc.supplierId) },
        { label: 'Destination', valeur: 'Dépôt (réserve)' },
        { label: 'Frais de la facture', valeur: money(doc.fees) },
        { label: 'Remarque', valeur: doc.note || '—' }
      ],
      lignes: (doc.lines || []).map(ligne => ({
        product: productName(ligne.productId),
        code: ligne.code || '',
        lot: ligne.number || lotNumber(ligne.lotId),
        expiresOn: ligne.expiresOn,
        quantity: ligne.quantity,
        unitCost: ligne.unitCost,
        // « value » reste un NOMBRE : c'est DocumentModal qui le formate en Ar.
        // (Avant la 2.7.10, money() était appliqué ici puis une seconde fois dans
        // la boîte de dialogue → « NaN Ar » dans la colonne Valeur.)
        value: Number(ligne.unitCost || 0) * Number(ligne.quantity || 0)
      }))
    };
  }, [detail?.id, productName, supplierName, lotNumber]);

  return (
    <>
      <Card title={`${receptions.length} réception(s) récente(s)`}
        actions={<Btn variant="primary" icon={PackagePlus} onClick={() => setCreation(true)}>Nouvelle réception</Btn>}>
        <ErrorBox error={error} />
        {receptions.length === 0 ? <Empty>Aucune réception enregistrée.</Empty> : (
          <Table columns={[
            { label: 'Référence' }, { label: 'Fournisseur' }, { label: 'Destination' },
            { label: 'Date' }, { label: 'Frais', num: true }, { label: 'Coût total', num: true }, { label: '' }
          ]}>
            {receptions.map(reception => (
              <tr key={reception.id}>
                <td><strong>{reception.reference}</strong></td>
                <td className="wrap">{supplierName(reception.supplierId)}</td>
                <td><Badge tone="info">Dépôt (réserve)</Badge></td>
                <td>{dateTime(reception.date)}</td>
                <td className="num">{money(reception.fees)}</td>
                <td className="num">{money(reception.costTotal)}</td>
                <td className="right">
                  <Btn variant="ghost" icon={Eye} onClick={() => setDetail({ id: reception.id, ajustements: [] })}>Détail</Btn>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <p className="muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
          « Détail » ouvre le bon dans une fenêtre : vous pouvez le lire, le télécharger ou l’imprimer
          sans quitter la page. Un lot déjà reçu au même prix est complété ; réutiliser un numéro de lot
          à un autre prix crée un second lot (les deux coûts restent séparés, la moyenne reste juste).
        </p>
      </Card>

      {creation ? (
        <Modal title="Nouvelle réception" onClose={() => setCreation(false)} wide>
          <ReceiptForm onCancel={() => setCreation(false)} onDone={async reception => {
            toast.success(`Réception ${reception.reference} enregistrée.`);
            setCreation(false);
            // La boîte de dialogue de détail s'ouvre sur la réception qui vient d'être
            // créée, en signalant les numéros de lot réutilisés s'il y en a.
            setDetail({ id: reception.id, ajustements: reception.ajustements || [] });
            await refresh();
          }} />
        </Modal>
      ) : null}

      {detail ? (
        <DocumentModal titre={`Réception ${receptions.find(r => r.id === detail.id)?.reference || ''}`.trim()}
          charger={chargerDetail} ajustements={detail.ajustements} onClose={() => setDetail(null)} />
      ) : null}
    </>
  );
}