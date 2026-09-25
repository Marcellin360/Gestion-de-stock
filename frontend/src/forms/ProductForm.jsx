// Fiche médicament : identification, seuils d'alerte, taux de marge (RG22).
// Le prix de vente n'est jamais saisi : il découle du coût et du taux (RG05).
import { useState } from 'react';
import { referentials } from '../api/endpoints.js';
import { Btn, Check, Choice, ErrorBox, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const vide = {
  code: '', name: '', ingredient: '', dosage: '', form: '', presentation: '', barcode: '',
  categoryId: '', manufacturer: '', unit: 'boîte', minStock: 5, maxStock: '', storage: '', note: '',
  active: true, marginRate: 20
};

export default function ProductForm({ produit, onDone, onCancel }) {
  const { categories, productForms, units, settings } = useData();
  const { can } = useAuth();
  const [values, setValues] = useState(() => produit ? {
    ...vide, ...produit,
    categoryId: produit.categoryId ? String(produit.categoryId) : '',
    maxStock: produit.maxStock ?? '',
    marginRate: Number(produit.marginRate)
  } : { ...vide, marginRate: Number(settings.marginRate ?? 20) });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const maj = patch => setValues(etat => ({ ...etat, ...patch }));

  const soumettre = async event => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        code: values.code.trim(),
        name: values.name.trim(),
        ingredient: values.ingredient || '',
        dosage: values.dosage || '',
        form: values.form || '',
        presentation: values.presentation || '',
        barcode: values.barcode || null,
        categoryId: values.categoryId ? Number(values.categoryId) : null,
        manufacturer: values.manufacturer || '',
        unit: values.unit || 'boîte',
        minStock: Number(values.minStock || 0),
        maxStock: values.maxStock === '' ? null : Number(values.maxStock),
        storage: values.storage || '',
        note: values.note || '',
        active: Boolean(values.active),
        marginRate: Number(values.marginRate || 0)
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

  return (
    <form onSubmit={soumettre}>
      <ErrorBox error={error} />

      <div className="grid grid--2">
        <Field label="Code interne"><Input value={values.code} onChange={e => maj({ code: e.target.value })} required /></Field>
        <Field label="Désignation"><Input value={values.name} onChange={e => maj({ name: e.target.value })} required placeholder="Amoxicilline 500 mg" /></Field>
        <Field label="Principe actif"><Input value={values.ingredient} onChange={e => maj({ ingredient: e.target.value })} /></Field>
        <Field label="Dosage"><Input value={values.dosage} onChange={e => maj({ dosage: e.target.value })} placeholder="500 mg" /></Field>
        <Field label="Forme galénique" hint={productForms?.length ? `Suggestions : ${productForms.map(f => f.name).slice(0, 4).join(', ')}` : undefined}>
          <Input value={values.form} onChange={e => maj({ form: e.target.value })} list="formes-galeniques" />
        </Field>
        <datalist id="formes-galeniques">{(productForms || []).map(f => <option key={f.id} value={f.name} />)}</datalist>
        <Field label="Présentation"><Input value={values.presentation} onChange={e => maj({ presentation: e.target.value })} placeholder="Boîte de 20" /></Field>
        <Field label="Code-barres"><Input value={values.barcode || ''} onChange={e => maj({ barcode: e.target.value })} /></Field>
        <Field label="Catégorie">
          <Select value={values.categoryId} onChange={e => maj({ categoryId: e.target.value })}>
            <option value="">— sans catégorie —</option>
            {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </Select>
        </Field>
        <Field label="Laboratoire / fabricant"><Input value={values.manufacturer} onChange={e => maj({ manufacturer: e.target.value })} /></Field>
        <Field label="Unité de gestion" hint={units?.length ? `Exemples : ${units.map(u => u.name).slice(0, 4).join(', ')}` : 'boîte, flacon, sachet…'}>
          <Input value={values.unit} onChange={e => maj({ unit: e.target.value })} />
        </Field>
        <Field label="Seuil d’alerte (stock minimum)" hint="Le stock maximum proposé est 30 fois ce seuil (modifiable)">
          <Input type="number" min="0" step="1" value={values.minStock}
            onChange={e => maj({ minStock: e.target.value, maxStock: Number(e.target.value) * 30 })} />
        </Field>
        <Field label="Stock maximum (surstock)" hint="Facultatif"><Input type="number" min="0" step="1" value={values.maxStock} onChange={e => maj({ maxStock: e.target.value })} /></Field>
        <Field label={`Taux de marge (%) — ${mode}`
          + (can('prices') ? '' : ' · réservé aux profils autorisés')}>
          <Input type="number" min={settings.minMargin ?? 0} max={settings.maxMargin ?? 99} step="0.01"
            value={values.marginRate} onChange={e => maj({ marginRate: e.target.value })} disabled={!can('prices')} />
        </Field>
        <Field label="Conditions de conservation" hint="Choisissez un modèle, vous pourrez le compléter">
          <Input list="conservations" value={values.storage} onChange={e => maj({ storage: e.target.value })} placeholder="À l’abri de la lumière et de l’humidité" />
          <datalist id="conservations">
            <option value="À l’abri de la lumière et de l’humidité" />
            <option value="À température ambiante (< 25 °C)" />
            <option value="Au réfrigérateur (+2 °C à +8 °C)" />
            <option value="Au congélateur (−20 °C)" />
            <option value="À l’abri de la lumière, au frais et au sec" />
          </datalist>
        </Field>
      </div>

      <Field label="Note interne"><Textarea value={values.note} onChange={e => maj({ note: e.target.value })} /></Field>

      <Check label="Médicament actif (proposé à la vente)" checked={Boolean(values.active)} onChange={e => maj({ active: e.target.checked })} />

      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <Btn variant="ghost" onClick={onCancel}>Renoncer</Btn>
        <Btn variant="primary" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Btn>
      </div>
    </form>
  );
}
