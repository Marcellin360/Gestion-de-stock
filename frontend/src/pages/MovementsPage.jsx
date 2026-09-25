// Journal des mouvements de stock : chaque entrée/sortie avec son motif et son
// document d'origine. C'est la preuve de traçabilité exigée (RG14, RG19).
import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Card, Empty, Field, Input, Select } from '../components/ui.jsx';
import { MOVEMENT_LABELS, LOCATION_SHORT, dateTime, integer } from '../utils/format.js';

export default function MovementsPage() {
  const { movements, products, productName } = useData();
    const { user } = useAuth();
  // Le dépôt ne voit que ses propres mouvements : son magasin est verrouillé.
  const estDepot = user?.roleCode === 'DEPOT';
  const [filtres, setFiltres] = useState({
    produit: '', type: '', du: '', au: '', terme: '',
    magasin: estDepot ? 'DEPOT' : ''
  });

  const lignes = useMemo(() => movements.filter(movement => {
    if (filtres.magasin && movement.location !== filtres.magasin) return false;
    if (filtres.produit && Number(movement.productId) !== Number(filtres.produit)) return false;
    if (filtres.type && movement.kind !== filtres.type) return false;
    const jour = String(movement.createdAt).slice(0, 10);
    if (filtres.du && jour < filtres.du) return false;
    if (filtres.au && jour > filtres.au) return false;
    if (filtres.terme && !String(movement.reason || '').toLowerCase().includes(filtres.terme.toLowerCase())) return false;
    return true;
  }), [movements, filtres]);

  const entrees = lignes.filter(m => Number(m.quantity) > 0).reduce((total, m) => total + Number(m.quantity), 0);
  const sorties = lignes.filter(m => Number(m.quantity) < 0).reduce((total, m) => total - Number(m.quantity), 0);

  return (
    <Card title={`${lignes.length} mouvement(s)`}
      actions={<div className="pill-row">
        <Badge tone="ok">Entrées : {integer(entrees)}</Badge>
        <Badge tone="warn">Sorties : {integer(sorties)}</Badge>
      </div>}>
      <div className="inline-form" style={{ marginBottom: 12 }}>
          {estDepot ? (
          <Field label="Magasin" hint="Votre profil travaille sur la réserve : seuls les mouvements du dépôt sont affichés.">
            <Input value="Dépôt (réserve)" readOnly />
          </Field>
        ) : (
          <Field label="Magasin">
            <Select value={filtres.magasin} onChange={e => setFiltres({ ...filtres, magasin: e.target.value })}>
              <option value="">Les deux magasins</option>
              <option value="DEPOT">Dépôt (réserve)</option>
              <option value="PHARMACY">Pharmacie (comptoir)</option>
            </Select>
          </Field>
        )}
        <Field label="Médicament">
          <Select value={filtres.produit} onChange={e => setFiltres({ ...filtres, produit: e.target.value })}>
            <option value="">Tous</option>
            {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={filtres.type} onChange={e => setFiltres({ ...filtres, type: e.target.value })}>
            <option value="">Tous</option>
            {Object.entries(MOVEMENT_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </Select>
        </Field>
        <Field label="Du"><Input type="date" value={filtres.du} onChange={e => setFiltres({ ...filtres, du: e.target.value })} /></Field>
        <Field label="Au"><Input type="date" value={filtres.au} onChange={e => setFiltres({ ...filtres, au: e.target.value })} /></Field>
        <Field label="Motif"><Input value={filtres.terme} onChange={e => setFiltres({ ...filtres, terme: e.target.value })} placeholder="Rechercher un motif" /></Field>
      </div>

      {lignes.length === 0 ? <Empty>Aucun mouvement sur cette période.</Empty> : (
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>#</th><th>Date</th><th>Magasin</th><th>Médicament</th><th>Type</th><th className="num">Quantité</th><th>Lot</th><th>Motif</th></tr></thead>
            <tbody>
              {lignes.slice(0, 500).map(movement => (
                <tr key={movement.id}>
                  <td>{movement.id}</td>
                  <td>{dateTime(movement.createdAt)}</td>
                  <td><Badge tone={movement.location === 'DEPOT' ? 'info' : 'default'}>{LOCATION_SHORT[movement.location] || '—'}</Badge></td>
                  <td className="wrap">{productName(movement.productId)}</td>
                  <td><Badge tone={Number(movement.quantity) > 0 ? 'ok' : 'warn'}>{MOVEMENT_LABELS[movement.kind] || movement.kind}</Badge></td>
                  <td className="num">{Number(movement.quantity) > 0 ? '+' : ''}{integer(movement.quantity)}</td>
                  <td>{movement.lotId}</td>
                  <td className="wrap">{movement.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
        Les 500 mouvements les plus récents sont chargés ici ; pour une période plus ancienne, utilisez le rapport « Mouvements ».
      </p>
    </Card>
  );
}
