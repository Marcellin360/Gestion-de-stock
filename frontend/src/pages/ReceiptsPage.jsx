// Réceptions : entrée de marchandise, création des lots, frais répartis,
// recalcul du coût de revient (CMP) et du prix de vente.
import { useState } from 'react';
import { PackagePlus, Printer } from 'lucide-react';
import { openPrintable } from '../api/client.js';
import { documents as documentsApi } from '../api/endpoints.js';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Modal, Table } from '../components/ui.jsx';
import ReceiptForm from '../forms/ReceiptForm.jsx';
import { DOCUMENT_LABELS, dateTime, integer, money } from '../utils/format.js';

export default function ReceiptsPage() {
  const { documents, productName, supplierName, refresh } = useData();
  const toast = useToast();
  const [creation, setCreation] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [error, setError] = useState(null);

  const receptions = documents.filter(doc => doc.kind === 'RECEIPT');

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
                <td className="right"><Btn variant="ghost" icon={Printer} onClick={() => openPrintable(`/documents/RECEIPT/${reception.id}/print`)}>Bon</Btn></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {creation ? (
        <Modal title="Nouvelle réception" onClose={() => setCreation(false)} wide>
          <ReceiptForm onCancel={() => setCreation(false)} onDone={async reception => {
            toast.success(`Réception ${reception.reference} enregistrée.`);
            setCreation(false);
            try {
              setResultat(await documentsApi.detail('RECEIPT', reception.id));
            } catch {
              setResultat(reception);
            }
            await refresh();
          }} />
        </Modal>
      ) : null}

      {resultat ? (
        <Modal title={`Réception ${resultat.reference} enregistrée`} onClose={() => setResultat(null)}
          footer={<>
            <Btn variant="ghost" onClick={() => setResultat(null)}>Fermer</Btn>
            <Btn icon={Printer} onClick={() => openPrintable(`/documents/RECEIPT/${resultat.id}/print`)}>Imprimer le bon</Btn>
          </>}>
          <p>Les lots sont créés, le coût de revient (CMP) et les prix de vente ont été recalculés.</p>
          <dl className="kv">
            <dt>Fournisseur</dt><dd>{supplierName(resultat.supplierId)}</dd>
            <dt>Frais répartis</dt><dd>{money(resultat.fees)}</dd>
            <dt>Coût total</dt><dd>{money(resultat.costTotal)}</dd>
            <dt>Lots créés</dt><dd>{Array.isArray(resultat.lines) ? resultat.lines.length : '—'}</dd>
          </dl>
          {Array.isArray(resultat.lines) && resultat.lines.length ? (
            <div style={{ marginTop: 12 }}>
              <Table columns={[{ label: 'Médicament' }, { label: 'Lot' }, { label: 'Qté', num: true }, { label: 'Coût unitaire', num: true }]}>
                {resultat.lines.map((line, index) => (
                  <tr key={index}>
                    <td className="wrap">{productName(line.productId)}</td>
                    <td>{line.lotNumber || line.number}</td>
                    <td className="num">{integer(line.quantity)}</td>
                    <td className="num">{money(line.unitCost)}</td>
                  </tr>
                ))}
              </Table>
            </div>
          ) : null}
          <Badge tone="ok">Document {DOCUMENT_LABELS[resultat.kind] || resultat.kind} validé — stock mis à jour.</Badge>
        </Modal>
      ) : null}
    </>
  );
}