// Fournisseurs : coordonnées, références légales, achats réalisés.
import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Modal, Table } from '../components/ui.jsx';
import SupplierForm from '../forms/SupplierForm.jsx';
import { money } from '../utils/format.js';

export default function SuppliersPage() {
  const { suppliers, documents, refresh } = useData();
  const toast = useToast();
  const [edition, setEdition] = useState(null);
  const [error, setError] = useState(null);

  const achats = supplierId => documents
    .filter(doc => doc.kind === 'RECEIPT' && Number(doc.supplierId) === Number(supplierId) && doc.status === 'VALIDATED')
    .reduce((somme, doc) => somme + Number(doc.costTotal || 0), 0);

  return (
    <>
      <Card title={`${suppliers.length} fournisseur(s)`}
        actions={<Btn variant="primary" icon={Plus} onClick={() => setEdition('nouveau')}>Nouveau fournisseur</Btn>}>
        <ErrorBox error={error} />
        {suppliers.length === 0 ? <Empty>Aucun fournisseur enregistré.</Empty> : (
          <Table columns={[
            { label: 'Fournisseur' }, { label: 'Contact' }, { label: 'Téléphone' },
            { label: 'Adresse' }, { label: 'Achats récents', num: true }, { label: 'État' }, { label: '' }
          ]}>
            {suppliers.map(fournisseur => (
              <tr key={fournisseur.id}>
                <td><strong>{fournisseur.name}</strong>{fournisseur.nif ? <div className="muted" style={{ fontSize: '.78rem' }}>NIF {fournisseur.nif}</div> : null}</td>
                <td>{fournisseur.contact || '—'}{fournisseur.email ? <div className="muted" style={{ fontSize: '.78rem' }}>{fournisseur.email}</div> : null}</td>
                <td>{fournisseur.phone || '—'}</td>
                <td className="wrap">{fournisseur.address || '—'}</td>
                <td className="num">{money(achats(fournisseur.id))}</td>
                <td>{fournisseur.active ? <Badge tone="ok">actif</Badge> : <Badge tone="danger">inactif</Badge>}</td>
                <td className="right"><Btn variant="ghost" icon={Pencil} onClick={() => setEdition(fournisseur)} aria-label="Modifier" /></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {edition ? (
        <Modal title={edition === 'nouveau' ? 'Nouveau fournisseur' : `Modifier ${edition.name}`} onClose={() => setEdition(null)} wide>
          <SupplierForm fournisseur={edition === 'nouveau' ? null : edition} onCancel={() => setEdition(null)} onDone={async () => {
            toast.success('Fournisseur enregistré.');
            setEdition(null);
            await refresh();
          }} />
        </Modal>
      ) : null}
    </>
  );
}
