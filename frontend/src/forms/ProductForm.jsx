// Fiche médicament — version courte.
//
// Deux simplifications demandées par l'officine :
//   • le CODE INTERNE (MED-001, MED-002…) et le CODE-BARRES ne se saisissent plus :
//     le logiciel les attribue automatiquement à l'enregistrement ; ils restent
//     affichés en lecture seule pour l'étiquette et la douchette ;
//   • les champs de description (principe actif, dosage, forme galénique,
//     laboratoire, conditions de conservation) ne sont plus demandés : la fiche
//     utile au comptoir tient en une ligne (désignation, catégorie, unité, seuils).
//
// Le prix de vente de la BOÎTE n'est jamais saisi : il découle du coût et du
// taux de marge (RG05).
//
// 2.7.12 — vente au détail (boîte / plaquette / comprimé) :
//   • conditionnement : nombre de plaquettes par boîte, nombre de comprimé par
//     plaquette (« matetika » 10 et 10) ; 0 plaquette = vente à la boîte seule ;
//   • PRIX DÉTAILLÉS indépendants (« tsy hitovy mihitsy ») : à 0, le serveur
//     calcule automatiquement au prorata du prix de la boîte au moment de la
//     vente (prix boîte ÷ plaquettes, puis ÷ comprimé) — utile si l'officine
//     pratique le prix proportionnel ; sinon saisir le prix réel affiché.
import { useState } from 'react';
import { referentials } from '../api/endpoints.js';
import { Banner, Btn, Check, ErrorBox, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const vide = {
  name: '', presentation: '', categoryId: '', unit: 'boîte', minStock: 5, maxStock: '',
  note: '', active: true, marginRate: 20,
  blistersPerBox: 10, unitsPerBlister: 10, pricePerBlister: 0, pricePerUnit: 0
};

export default function ProductForm({ produit, onDone, onCancel }) {
  const { categories, units, settings } = useData();
  const { can } = useAuth();
  const [values, setValues] = useState(() => produit ? {
    ...vide, ...produit,
    categoryId: produit.categoryId ? String(produit.categoryId) : '',
    maxStock: produit.maxStock ?? '',
    marginRate: Number(produit.marginRate),
    // 2.7.12 — conditionnement et prix au détail (défauts si ancienne fiche).
    blistersPerBox: produit.blistersPerBox ?? 10,
    unitsPerBlister: produit.unitsPerBlister ?? 10,
    pricePerBlister: Number(produit.pricePerBlister || 0),
    pricePerUnit: Number(produit.pricePerUnit || 0)
  } : { ...vide, marginRate: Number(settings.marginRate ?? 20) });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const maj = patch => setValues(etat => ({ ...etat, ...patch }));

  const soumettre = async event => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Volontairement court : ni code, ni code-barres, ni champs descriptifs.
      // Le serveur complète (code interne + code-barres EAN-13 internes).
      const payload = {
        name: values.name.trim(),
        presentation: values.presentation || '',
        categoryId: values.categoryId ? Number(values.categoryId) : null,
        unit: values.unit || 'boîte',
        minStock: Number(values.minStock || 0),
        maxStock: values.maxStock === '' ? null : Number(values.maxStock),
        note: values.note || '',
        active: Boolean(values.active),
        marginRate: Number(values.marginRate || 0),
        // 2.7.12 — conditionnement et prix au détail.
        blistersPerBox: Number(values.blistersPerBox || 0),
        unitsPerBlister: Number(values.unitsPerBlister || 0),
        pricePerBlister: Number(values.pricePerBlister || 0),
        pricePerUnit: Number(values.pricePerUnit || 0)
      };
      const enregistre = produit
        ? await referentials.update('products', produit.id, payload)
        : await referentials.create('products', payload);
      onDone(enregistre);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const mode = settings.marginMode === 'SALE' ? 'sur le prix de vente' : 'sur le coût d’achat';
  const blisters = Number(values.blistersPerBox || 0);
  const comprimes = Number(values.unitsPerBlister || 0);

  return (
    <form onSubmit={soumettre}>
      <ErrorBox error={error} />

      {produit ? (
        <div className="grid grid--2">
          <Field label="Code interne (attribué par le logiciel)">
            <Input value={produit.code || '—'} readOnly />
          </Field>
          <Field label="Code-barres (attribué par le logiciel)">
            <Input value={produit.barcode || '—'} readOnly />
          </Field>
        </div>
      ) : (
        <Banner tone="info" title="Code interne et code-barres automatiques">
          Rien à saisir : le logiciel attribue le <strong>code interne</strong> (série MED-001, MED-002…)
          et un <strong>code-barres</strong> interne valide au moment de l’enregistrement. Vous les retrouverez
          sur la fiche du médicament, prêts à être imprimés ou scannés.
        </Banner>
      )}

      <div className="grid grid--2">
        <Field label="Désignation">
          <Input value={values.name} onChange={e => maj({ name: e.target.value })} required
            placeholder="Amoxicilline 500 mg" autoFocus />
        </Field>
        <Field label="Catégorie">
          <Select value={values.categoryId} onChange={e => maj({ categoryId: e.target.value })}>
            <option value="">— sans catégorie —</option>
            {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </Select>
        </Field>
        <Field label="Présentation">
          <Input value={values.presentation} onChange={e => maj({ presentation: e.target.value })} placeholder="Boîte de 20" />
        </Field>
        <Field label="Unité de gestion" hint={units?.length ? `Exemples : ${units.map(u => u.name).slice(0, 4).join(', ')}` : 'boîte, flacon, sachet…'}>
          <Input value={values.unit} onChange={e => maj({ unit: e.target.value })} />
        </Field>
        <Field label="Seuil d’alerte (stock minimum)" hint="Le stock maximum proposé est 30 fois ce seuil (modifiable)">
          <Input type="number" min="0" step="1" value={values.minStock}
            onChange={e => maj({ minStock: e.target.value, maxStock: Number(e.target.value) * 30 })} />
        </Field>
        <Field label="Stock maximum (surstock)" hint="Facultatif">
          <Input type="number" min="0" step="1" value={values.maxStock} onChange={e => maj({ maxStock: e.target.value })} />
        </Field>
        <Field label={`Taux de marge (%) — ${mode}` + (can('prices') ? '' : ' · réservé aux profils autorisés')}>
          <Input type="number" min={settings.minMargin ?? 0} max={settings.maxMargin ?? 99} step="0.01"
            value={values.marginRate} onChange={e => maj({ marginRate: e.target.value })} disabled={!can('prices')} />
        </Field>
      </div>

      {/* 2.7.12 — vente au détail : conditionnement (plaquettes / comprimé) et
          prix indépendants. Le vendeur choisit Boîte / Plaquette / Comprimé pour
          chaque ligne du panier ; le stock reste compté en boîtes (0,1 boîte
          par plaquette vendue si la boîte en fait 10). */}
      <Banner tone="info" title="Vente au détail : plaquette et comprimé">
        « Matetika » : 1 boîte = <strong>10 plaquettes</strong> et 1 plaquette = <strong>10 comprimés</strong>.
        Mettez <strong>0</strong> si ce médicament ne se vend qu’à la boîte entière
        (flacon, ampoule…). Les prix à 0 sont calculés automatiquement au prorata
        du prix de la boîte : ici, {blisters > 0
          ? <>1 plaquette &asymp; prix boîte ÷ {blisters}{comprimes > 0 ? <> ; 1 comprimé &asymp; prix boîte ÷ {blisters * comprimes}</> : ''}.</>
          : 'aucune sous-unité (vente à la boîte seule).'}
      </Banner>
      <div className="grid grid--2">
        <Field label="Plaquettes par boîte" hint="Ex. 10 — 0 = pas de vente par plaquette">
          <Input type="number" min="0" step="1" value={values.blistersPerBox}
            onChange={e => maj({ blistersPerBox: e.target.value })} />
        </Field>
        <Field label="Comprimé par plaquette" hint="Ex. 10 — 0 = pas de vente par comprimé">
          <Input type="number" min="0" step="1" value={values.unitsPerBlister}
            onChange={e => maj({ unitsPerBlister: e.target.value })}
            disabled={blisters === 0} />
        </Field>
        <Field label="Prix d’une plaquette (Ar)" hint="0 = calculé automatiquement (prix boîte ÷ plaquettes)">
          <Input type="number" min="0" step="0.01" value={values.pricePerBlister}
            onChange={e => maj({ pricePerBlister: e.target.value })}
            disabled={blisters === 0} />
        </Field>
        <Field label="Prix d’un comprimé (Ar)" hint="0 = calculé automatiquement (prix boîte ÷ plaquettes ÷ comprimé)">
          <Input type="number" min="0" step="0.01" value={values.pricePerUnit}
            onChange={e => maj({ pricePerUnit: e.target.value })}
            disabled={blisters === 0 || comprimes === 0} />
        </Field>
      </div>

      <Field label="Note interne"><Textarea value={values.note} onChange={e => maj({ note: e.target.value })} /></Field>

      <Check label="Médicament actif (proposé à la vente)" checked={Boolean(values.active)}
        onChange={e => maj({ active: e.target.checked })} />

      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <Btn variant="ghost" onClick={onCancel}>Renoncer</Btn>
        <Btn variant="primary" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Btn>
      </div>
    </form>
  );
}