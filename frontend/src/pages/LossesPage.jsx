// Pertes et dons : sorties non commerciales au coût retenu, motif imposé et
// remarque justificative obligatoire (RG06, RG07, RG17).
import { useState } from 'react';
import { PackageMinus, Printer } from 'lucide-react';
import { openPrintable } from '../api/client.js';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Modal, Table } from '../components/ui.jsx';
import LossForm from '../forms/LossForm.jsx';
import { LOCATION_SHORT, dateTime, money } from '../utils/format.js';

export default function LossesPage() {
  const { documents, refresh } = useData();
  const toast = useToast();
  const [creation, setCreation] = useState(false);
  const [error, setError] = useState(null);

  const pertes = documents.filter(doc => doc.kind === 'LOSS');
  const total = pertes.filter(doc => doc.status === 'VALIDATED')
    .reduce((somme, doc) => somme + Number(doc.costTotal || 0), 0);

  return (
    <>
      <Card title={`${pertes.length} déclaration(s)`}
        actions={<>
          <Badge tone="warn">Coût total constaté : {money(total)}</Badge>
          <Btn variant="primary" icon={PackageMinus} onClick={() => setCreation(true)}>Déclarer une perte</Btn>
        </>}>
        <ErrorBox error={error} />
        {pertes.length === 0 ? <Empty>Aucune perte ni don enregistré.</Empty> : (
          <Table columns={[
            { label: 'Référence' }, { label: 'Magasin' }, { label: 'Motif' }, { label: 'Remarque' },
            { label: 'Date' }, { label: 'Coût sorti', num: true }, { label: 'État' }, { label: '' }
          ]}>
            {pertes.map(perte => (
              <tr key={perte.id}>
                <td><strong>{perte.reference}</strong></td>
                <td><Badge tone={perte.location === 'DEPOT' ? 'info' : 'default'}>{LOCATION_SHORT[perte.location] || '—'}</Badge></td>
                <td>{perte.reason}</td>
                <td className="wrap">{perte.note}</td>
                <td>{dateTime(perte.date)}</td>
                <td className="num">{money(perte.costTotal)}</td>
                <td>{perte.status === 'VALIDATED' ? <Badge tone="ok">validée</Badge> : <Badge tone="danger">annulée</Badge>}</td>
                <td className="right"><Btn variant="ghost" icon={Printer} onClick={() => openPrintable(`/documents/LOSS/${perte.id}/print`)}>Fiche</Btn></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {creation ? (
        <Modal title="Déclarer une perte ou un don" onClose={() => setCreation(false)} wide>
          <LossForm onCancel={() => setCreation(false)} onDone={async perte => {
            toast.success(`Perte ${perte.reference} enregistrée : ${money(perte.costTotal)} sortis du stock.`);
            setCreation(false);
            await refresh();
          }} />
        </Modal>
      ) : null}
    </>
  );
}
