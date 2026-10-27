// Catégories de médicaments : classement utilisé dans les écrans, les rapports
// et la recherche.
//
// 2.7.78 — présentation demandée par l'officine (même convention que les
//   fournisseurs et les réceptions) :
//   • le libellé du filtre redevient « Recherche » (plus de « (LIKE) ») et la
//     case passe à DROITE du titre, dans l'en-tête de la carte ;
//   • la colonne des gestes s'intitule « Action », son contenu est CENTRÉ, et
//     « Modifier » passe au BLEU plein (famille détail).
import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Input, Modal, Table } from '../components/ui.jsx';
import CategoryForm from '../forms/CategoryForm.jsx';
import { integer } from '../utils/format.js';
import { COULEUR_DETAIL } from '../components/SaleHistoryModal.jsx';

export default function CategoriesPage() {
  const { categories, products, refresh } = useData();
  const toast = useToast();
  const [edition, setEdition] = useState(null);
  const [error, setError] = useState(null);
  // La recherche filtre par nom ou description (2.7.78 : libellé « Recherche »
  // tout court, case à droite du titre — comme les fournisseurs).
  const [recherche, setRecherche] = useState('');
  const visibles = categories.filter(categorie => {
    if (!recherche) return true;
    return `${categorie.name} ${categorie.description || ''}`.toLowerCase().includes(recherche.toLowerCase());
  });

  return (
    <>
      <Card title={`${categories.length} catégorie(s)`}
        actions={<>
          <Field label="Recherche">
            <Input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Nom ou description (ex. antibio, enfant…)…" title="Filtrer par une partie du nom ou de la description" />
          </Field>
          <Btn variant="primary" icon={Plus} onClick={() => setEdition('nouvelle')}>Nouvelle catégorie</Btn>
        </>}>
        <ErrorBox error={error} />
        {categories.length === 0 ? <Empty>Aucune catégorie enregistrée.</Empty> : (
          <Table columns={[{ label: 'Catégorie' }, { label: 'Description' }, { label: 'Médicaments', num: true }, { label: 'État' },
            // 2.7.78 — colonne des gestes CENTRÉE (comme fournisseurs/réceptions).
            { label: 'Action', center: true }]}>
            {visibles.map(categorie => (
              <tr key={categorie.id}>
                <td><strong>{categorie.name}</strong></td>
                <td className="wrap">{categorie.description || '—'}</td>
                <td className="num">{integer(products.filter(p => Number(p.categoryId) === Number(categorie.id)).length)}</td>
                <td>{categorie.active ? <Badge tone="ok">active</Badge> : <Badge tone="danger">inactive</Badge>}</td>
                {/* 2.7.78 — « Modifier » CENTRÉ et BLEU plein (famille détail). */}
                <td className="center nowrap">
                  <span className="actes">
                    <Btn variant="ghost" style={COULEUR_DETAIL} icon={Pencil} onClick={() => setEdition(categorie)} aria-label="Modifier" />
                  </span>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {edition ? (
        <Modal title={edition === 'nouvelle' ? 'Nouvelle catégorie' : `Modifier ${edition.name}`} onClose={() => setEdition(null)}>
          <CategoryForm categorie={edition === 'nouvelle' ? null : edition} onCancel={() => setEdition(null)} onDone={async () => {
            toast.success('Catégorie enregistrée.');
            setEdition(null);
            await refresh();
          }} />
        </Modal>
      ) : null}
    </>
  );
}