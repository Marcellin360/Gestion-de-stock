// Catégories de médicaments : classement utilisé dans les écrans, les rapports
// et la recherche.
import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Modal, Table } from '../components/ui.jsx';
import CategoryForm from '../forms/CategoryForm.jsx';
import { integer } from '../utils/format.js';

export default function CategoriesPage() {
  const { categories, products, refresh } = useData();
  const toast = useToast();
  const [edition, setEdition] = useState(null);
  const [error, setError] = useState(null);

  return (
    <>
      <Card title={`${categories.length} catégorie(s)`}
        actions={<Btn variant="primary" icon={Plus} onClick={() => setEdition('nouvelle')}>Nouvelle catégorie</Btn>}>
        <ErrorBox error={error} />
        {categories.length === 0 ? <Empty>Aucune catégorie enregistrée.</Empty> : (
          <Table columns={[{ label: 'Catégorie' }, { label: 'Description' }, { label: 'Médicaments', num: true }, { label: 'État' }, { label: '' }]}>
            {categories.map(categorie => (
              <tr key={categorie.id}>
                <td><strong>{categorie.name}</strong></td>
                <td className="wrap">{categorie.description || '—'}</td>
                <td className="num">{integer(products.filter(p => Number(p.categoryId) === Number(categorie.id)).length)}</td>
                <td>{categorie.active ? <Badge tone="ok">active</Badge> : <Badge tone="danger">inactive</Badge>}</td>
                <td className="right"><Btn variant="ghost" icon={Pencil} onClick={() => setEdition(categorie)} aria-label="Modifier" /></td>
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
