// Catalogue des médicaments : identification, coût retenu, prix de vente,
// stock par produit et modification du taux de marge (RG22, RG23).
import { useMemo, useState } from 'react';
import { Plus, Pencil, Percent, History, Ban, Check } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Input, Modal, Select, Table } from '../components/ui.jsx';
import ProductForm from '../forms/ProductForm.jsx';
import MarginForm from '../forms/MarginForm.jsx';
import { money, percent, integer } from '../utils/format.js';
import { referentials } from '../api/endpoints.js';

export default function ProductsPage() {
  const { products, stockByProduct, categoryName, settings, refresh, productName } = useData();
  const { can } = useAuth();
  const toast = useToast();
  const [filtres, setFiltres] = useState({ terme: '', categorie: '', etat: 'actifs' });
  const [edition, setEdition] = useState(null);
  const [marge, setMarge] = useState(null);
  const [historique, setHistorique] = useState(null);
  const [error, setError] = useState(null);

  const lignes = useMemo(() => products.filter(produit => {
    if (filtres.etat === 'actifs' && !produit.active) return false;
    if (filtres.etat === 'inactifs' && produit.active) return false;
    if (filtres.categorie && Number(produit.categoryId) !== Number(filtres.categorie)) return false;
    if (filtres.terme) {
      const needle = filtres.terme.toLowerCase();
      if (![produit.name, produit.code, produit.ingredient, produit.barcode].join(' ').toLowerCase().includes(needle)) return false;
    }
    return true;
  }), [products, filtres]);

  const voirHistorique = async produit => {
    setError(null);
    try {
      const liste = await referentials.priceHistory(produit.id);
      setHistorique({ produit, liste });
    } catch (cause) {
      setError(cause);
    }
  };

  const basculerActivation = async produit => {
    setError(null);
    try {
      await referentials.update('products', produit.id, { ...produit, active: !produit.active });
      toast.success(produit.active ? 'Médicament désactivé.' : 'Médicament réactivé.');
      await refresh();
    } catch (cause) {
      setError(cause);
    }
  };

  return (
    <>
      <Card title={`${lignes.length} médicament(s)`}
        actions={can('reference') ? <Btn variant="primary" icon={Plus} onClick={() => setEdition('nouveau')}>Nouveau médicament</Btn> : null}>
        <ErrorBox error={error} />
        <div className="inline-form" style={{ marginBottom: 12 }}>
          <Field label="Recherche">
            <Input value={filtres.terme} onChange={e => setFiltres({ ...filtres, terme: e.target.value })} placeholder="Nom, code, principe actif…" />
          </Field>
          <Field label="Catégorie">
            <Select value={filtres.categorie} onChange={e => setFiltres({ ...filtres, categorie: e.target.value })}>
              <option value="">Toutes</option>
              {[...new Set(products.map(p => p.categoryId))].filter(Boolean).map(id => (
                <option key={id} value={id}>{categoryName(id)}</option>
              ))}
            </Select>
          </Field>
          <Field label="État">
            <Select value={filtres.etat} onChange={e => setFiltres({ ...filtres, etat: e.target.value })}>
              <option value="actifs">Actifs</option>
              <option value="inactifs">Désactivés</option>
              <option value="tous">Tous</option>
            </Select>
          </Field>
        </div>

        {lignes.length === 0 ? <Empty>Aucun médicament ne correspond à ces critères.</Empty> : (
          <Table columns={[
            { label: 'Code' }, { label: 'Médicament' }, { label: 'Catégorie' },
            { label: 'Stock', num: true },
            ...(can(['prices', 'costs']) ? [{ label: 'CMP', num: true }, { label: 'Taux', num: true }] : []),
            { label: 'Prix de vente', num: true }, { label: 'Seuil', num: true }, { label: '' }
          ]}>
            {lignes.map(produit => {
              const stock = stockByProduct(produit.id);
              const alerte = stock <= Number(produit.minStock);
              return (
                <tr key={produit.id}>
                  <td>{produit.code}</td>
                  <td className="wrap">
                    <strong>{produit.name}</strong>
                    <div className="muted" style={{ fontSize: '.78rem' }}>
                      {[produit.dosage, produit.form, produit.presentation].filter(Boolean).join(' · ')}
                      {produit.active ? '' : ' · désactivé'}
                    </div>
                  </td>
                  <td>{produit.categoryId ? categoryName(produit.categoryId) : '—'}</td>
                  <td className="num">{integer(stock)}{alerte ? <Badge tone="danger">seuil</Badge> : null}</td>
                  {can(['prices', 'costs']) ? <td className="num">{money(produit.cmp)}</td> : null}
                  {can(['prices', 'costs']) ? <td className="num">{percent(produit.marginRate)}</td> : null}
                  <td className="num">{money(produit.sellingPrice)}</td>
                  <td className="num">{integer(produit.minStock)}</td>
                  <td className="right nowrap">
                    {can('reference') ? <Btn variant="ghost" icon={Pencil} onClick={() => setEdition(produit)} aria-label="Modifier" /> : null}
                    {can(['prices', 'costs']) ? <Btn variant="ghost" icon={Percent} onClick={() => setMarge(produit)} aria-label="Taux de marge" /> : null}
                    <Btn variant="ghost" icon={History} onClick={() => voirHistorique(produit)} aria-label="Historique des prix" />
                    {can('reference') ? (
                      <Btn variant="ghost" icon={produit.active ? Ban : Check} onClick={() => basculerActivation(produit)}
                        aria-label={produit.active ? 'Désactiver' : 'Réactiver'} />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
        <p className="muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
          Un médicament n’est jamais supprimé : il est désactivé pour rester lisible dans l’historique (RG19).
          Mode de marge actuel : {settings.marginMode === 'SALE' ? 'sur le prix de vente' : 'sur le coût d’achat'}.
        </p>
      </Card>

      {edition ? (
        <Modal title={edition === 'nouveau' ? 'Nouveau médicament' : `Modifier ${edition.name}`} onClose={() => setEdition(null)} wide>
          <ProductForm produit={edition === 'nouveau' ? null : edition} onCancel={() => setEdition(null)} onDone={async () => {
            toast.success('Fiche médicament enregistrée.');
            setEdition(null);
            await refresh();
          }} />
        </Modal>
      ) : null}

      {marge ? (
        <Modal title={`Taux de marge — ${marge.name}`} onClose={() => setMarge(null)} wide>
          <MarginForm produit={marge} onCancel={() => setMarge(null)} onDone={async resultat => {
            toast.success(`Nouveau prix de vente : ${money(resultat.sellingPrice)}`);
            setMarge(null);
            await refresh();
          }} />
        </Modal>
      ) : null}

      {historique ? (
        <Modal title={`Historique des prix — ${historique.produit.name}`} onClose={() => setHistorique(null)} wide
          footer={<Btn variant="ghost" onClick={() => setHistorique(null)}>Fermer</Btn>}>
          {historique.liste.length === 0 ? <Empty>Aucun changement de prix enregistré.</Empty> : (
            <Table columns={[{ label: 'Date' }, { label: 'Coût' }, { label: 'Ancien taux' }, { label: 'Nouveau taux' }, { label: 'Prix', num: true }, { label: 'Motif' }]}>
              {historique.liste.map(entree => (
                <tr key={entree.id}>
                  <td>{new Date(entree.createdAt).toLocaleString('fr-FR')}</td>
                  <td>{money(entree.cost)}</td>
                  <td>{percent(entree.previousRate)}</td>
                  <td>{percent(entree.rate)}</td>
                  <td className="num">{money(entree.price)}</td>
                  <td className="wrap">{entree.reason}</td>
                </tr>
              ))}
            </Table>
          )}
        </Modal>
      ) : null}
    </>
  );
}
