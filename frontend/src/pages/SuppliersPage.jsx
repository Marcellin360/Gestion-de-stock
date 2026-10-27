// Fournisseurs : coordonnées, références légales, achats réalisés.
//
// Deux gestes par ligne : le crayon (modifier la fiche) et la corbeille
// (supprimer le fournisseur). La suppression est définitive — le serveur la
// refuse quand le fournisseur a déjà livré, et le message explique alors
// qu'il faut simplement le désactiver pour garder l'historique lisible.
//
// 2.7.78 — présentation demandée par l'officine (même convention que les
//   réceptions, les transferts, les pertes et les catégories) :
//   • le libellé du filtre redevient « Recherche » (plus de « (LIKE) ») et
//     la case passe à DROITE du titre, dans l'en-tête de la carte ;
//   • la colonne des gestes s'intitule « Action » et son contenu est CENTRÉ ;
//   • « Modifier » (bleu), « Supprimer » (rouge) : boutons PLEINS de la famille
//     détail / suppression, avec un espace visible entre eux (.actes).
import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { referentials } from '../api/endpoints.js';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Banner, Btn, Card, Empty, ErrorBox, Field, Input, Modal, Table } from '../components/ui.jsx';
import SupplierForm from '../forms/SupplierForm.jsx';
import { money } from '../utils/format.js';
import { COULEUR_DETAIL, COULEUR_ANNULER } from '../components/SaleHistoryModal.jsx';

export default function SuppliersPage() {
  const { suppliers, documents, refresh } = useData();
  const toast = useToast();
  const [edition, setEdition] = useState(null);
  const [suppression, setSuppression] = useState(null);
  const [error, setError] = useState(null);
  const [erreurSuppression, setErreurSuppression] = useState(null);
  const [busy, setBusy] = useState(false);
  // La recherche filtre par nom, contact, téléphone, adresse, NIF (2.7.78 :
  // libellé « Recherche » tout court, case à droite du titre — comme les
  // réceptions, les catégories et les pertes).
  const [recherche, setRecherche] = useState('');
  const visibles = suppliers.filter(fournisseur => {
    if (!recherche) return true;
    const cible = [fournisseur.name, fournisseur.contact, fournisseur.phone, fournisseur.address, fournisseur.nif, fournisseur.email]
      .join(' ').toLowerCase();
    return cible.includes(recherche.toLowerCase());
  });

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
        actions={<>
          <Field label="Recherche">
            <Input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Nom, contact, téléphone, adresse, NIF…" title="Filtrer : une partie du nom, du contact, du téléphone, de l'adresse ou du NIF suffit" />
          </Field>
          <Btn variant="primary" icon={Plus} onClick={() => setEdition('nouveau')}>Nouveau fournisseur</Btn>
        </>}>
        <ErrorBox error={error} />
        {suppliers.length === 0 ? <Empty>Aucun fournisseur enregistré.</Empty> : (
          <Table columns={[
            { label: 'Fournisseur' }, { label: 'Contact' }, { label: 'Téléphone' },
            { label: 'Adresse' }, { label: 'Achats récents', num: true }, { label: 'État' },
            // 2.7.78 — colonne des gestes CENTRÉE (comme réceptions/transferts/pertes).
            { label: 'Action', center: true }
          ]}>
            {visibles.map(fournisseur => (
              <tr key={fournisseur.id}>
                <td><strong>{fournisseur.name}</strong>{fournisseur.nif ? <div className="muted" style={{ fontSize: '.78rem' }}>NIF {fournisseur.nif}</div> : null}</td>
                <td>{fournisseur.contact || '—'}{fournisseur.email ? <div className="muted" style={{ fontSize: '.78rem' }}>{fournisseur.email}</div> : null}</td>
                <td>{fournisseur.phone || '—'}</td>
                <td className="wrap">{fournisseur.address || '—'}</td>
                <td className="num">{money(achats(fournisseur.id))}</td>
                <td>{fournisseur.active ? <Badge tone="ok">actif</Badge> : <Badge tone="danger">inactif</Badge>}</td>
                {/* 2.7.78 — gestes CENTRÉS, PLEINS et espacés : Modifier bleu,
                    Supprimer rouge (mêmes couleurs que partout). */}
                <td className="center nowrap">
                  <span className="actes">
                    <Btn variant="ghost" style={COULEUR_DETAIL} icon={Pencil} title={`Modifier ${fournisseur.name}`}
                      onClick={() => { setErreurSuppression(null); setEdition(fournisseur); }} aria-label="Modifier" />
                    <Btn variant="ghost" style={COULEUR_ANNULER} icon={Trash2} title={`Supprimer ${fournisseur.name}`}
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