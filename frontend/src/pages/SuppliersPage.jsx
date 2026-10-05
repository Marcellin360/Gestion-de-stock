// Fournisseurs : coordonnées, références légales, achats réalisés.
//
// Deux gestes par ligne : le crayon (modifier la fiche) et la corbeille
// (supprimer le fournisseur). La suppression est définitive — le serveur la
// refuse quand le fournisseur a déjà livré, et le message explique alors
// qu'il faut simplement le désactiver pour garder l'historique lisible.
import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { referentials } from '../api/endpoints.js';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Banner, Btn, Card, Empty, ErrorBox, Modal, Table } from '../components/ui.jsx';
import SupplierForm from '../forms/SupplierForm.jsx';
import { money } from '../utils/format.js';

export default function SuppliersPage() {
  const { suppliers, documents, refresh } = useData();
  const toast = useToast();
  const [edition, setEdition] = useState(null);
  const [suppression, setSuppression] = useState(null);
  const [error, setError] = useState(null);
  const [erreurSuppression, setErreurSuppression] = useState(null);
  const [busy, setBusy] = useState(false);

  const achats = supplierId => documents
    .filter(doc => doc.kind === 'RECEIPT' && Number(doc.supplierId) === Number(supplierId) && doc.status === 'VALIDATED')
    .reduce((somme, doc) => somme + Number(doc.costTotal || 0), 0);

  const supprimer = async () => {
    setBusy(true);
    setErreurSuppression(null);
    try {
      await referentials.remove('suppliers', suppression.id);
      toast.success(`Fournisseur « ${suppression.name} » supprimé.`);
      setSuppression(null);
      await refresh();
    } catch (cause) {
      setErreurSuppression(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card title={`${suppliers.length} fournisseur(s)`}
        actions={<Btn variant="primary" icon={Plus} onClick={() => setEdition('nouveau')}>Nouveau fournisseur</Btn>}>
        <ErrorBox error={error} />
        {suppliers.length === 0 ? <Empty>Aucun fournisseur enregistré.</Empty> : (
          <Table columns={[
            { label: 'Fournisseur' }, { label: 'Contact' }, { label: 'Téléphone' },
            { label: 'Adresse' }, { label: 'Achats récents', num: true }, { label: 'État' }, { label: 'Actions' }
          ]}>
            {suppliers.map(fournisseur => (
              <tr key={fournisseur.id}>
                <td><strong>{fournisseur.name}</strong>{fournisseur.nif ? <div className="muted" style={{ fontSize: '.78rem' }}>NIF {fournisseur.nif}</div> : null}</td>
                <td>{fournisseur.contact || '—'}{fournisseur.email ? <div className="muted" style={{ fontSize: '.78rem' }}>{fournisseur.email}</div> : null}</td>
                <td>{fournisseur.phone || '—'}</td>
                <td className="wrap">{fournisseur.address || '—'}</td>
                <td className="num">{money(achats(fournisseur.id))}</td>
                <td>{fournisseur.active ? <Badge tone="ok">actif</Badge> : <Badge tone="danger">inactif</Badge>}</td>
                <td className="right">
                  <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                    <Btn variant="ghost" icon={Pencil} title={`Modifier ${fournisseur.name}`}
                      onClick={() => { setErreurSuppression(null); setEdition(fournisseur); }} aria-label="Modifier" />
                    <Btn variant="ghost" icon={Trash2} title={`Supprimer ${fournisseur.name}`}
                      onClick={() => { setError(null); setErreurSuppression(null); setSuppression(fournisseur); }} aria-label="Supprimer" />
                  </span>
                </td>
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

      {suppression ? (
        <Modal title="Supprimer le fournisseur" onClose={() => setSuppression(null)}
          footer={<>
            <Btn variant="ghost" onClick={() => setSuppression(null)}>Renoncer</Btn>
            <Btn variant="danger" icon={Trash2} onClick={supprimer} disabled={busy}>
              {busy ? 'Suppression…' : 'Supprimer définitivement'}
            </Btn>
          </>}>
          <ErrorBox error={erreurSuppression} />
          <Banner tone="warn" title={`« ${suppression.name} » sera retiré de la liste`}>
            Cette opération est définitive. Elle est refusée si le fournisseur a déjà livré
            (réception enregistrée ou lot en stock) : dans ce cas, ouvrez sa fiche et décochez
            « Fournisseur actif » — il disparaît des choix d’achat sans effacer l’historique.
          </Banner>
        </Modal>
      ) : null}
    </>
  );
}