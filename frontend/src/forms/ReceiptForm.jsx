// Réception de marchandise AU DÉPÔT : création des lots, frais répartis sur les
// unités, calcul du coût de revient, mise à jour du CMP et du prix de vente.
//
// Règles de l'écran (version 2.7.1) :
//   • plus de numéro de facture à saisir : le numéro du bon de réception
//     (REC-AAAA-NNNNNN) est attribué AUTOMATIQUEMENT par le serveur ;
//   • la DATE D'EXPIRATION est obligatoire, lot par lot. Les boutons de durée
//     (6 mois, 1 an, 18 mois, 2 ans, 3 ans) ne font que remplir la date : la
//     valeur enregistrée est toujours une date précise, jamais une durée.
// Le passage vers la pharmacie se fait ensuite par un transfert, depuis l'écran
// « Transferts dépôt → pharmacie ».
import { useState } from 'react';
import { Plus, Trash2, PackagePlus, Calendar } from 'lucide-react';
import { stock } from '../api/endpoints.js';
import { newRequestKey } from '../api/client.js';
import { Btn, ErrorBox, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { useData } from '../context/DataContext.jsx';
import { today, money } from '../utils/format.js';

const ligneVide = () => ({
  productId: '', number: '', quantity: 1, purchasePrice: '',
  receivedOn: today(), expiresOn: '', manufacturedOn: ''
});

// Raccourcis de durée : ils remplissent la date d'expiration (« Reçu le » + durée).
const DUREES = [
  { mois: 6, label: '6 mois' },
  { mois: 12, label: '1 an' },
  { mois: 18, label: '18 mois' },
  { mois: 24, label: '2 ans' },
  { mois: 36, label: '3 ans' }
];

/** Ajoute des mois à une date (AAAA-MM-JJ) sans dépendance externe. */
const ajouterMois = (dateIso, mois) => {
  if (!dateIso) return '';
  const [annee, m, jour] = dateIso.split('-').map(Number);
  const cible = new Date(Date.UTC(annee, m - 1 + Number(mois), jour));
  return cible.toISOString().slice(0, 10);
};

const dateFr = iso => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR') : '—');

export default function ReceiptForm({ onDone, onCancel }) {
  const { products, suppliers } = useData();
  const [entete, setEntete] = useState({ supplierId: '', fees: '0', note: '' });
  const [lignes, setLignes] = useState([ligneVide()]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Numéro de lot proposé automatiquement : code du médicament + année (modifiable).
  const lotSuggere = productId => {
    const produit = products.find(p => Number(p.id) === Number(productId));
    return produit ? `${produit.code}-${new Date().getFullYear()}` : '';
  };

  const maj = (index, patch) => setLignes(liste => liste.map((ligne, i) => (i === index ? { ...ligne, ...patch } : ligne)));

  const total = lignes.reduce((somme, ligne) => somme + Number(ligne.quantity || 0) * Number(ligne.purchasePrice || 0), 0);
  const unites = lignes.reduce((somme, ligne) => somme + Number(ligne.quantity || 0), 0);
  const coutUnitaireMoyen = unites ? (total + Number(entete.fees || 0)) / unites : 0;
  // Lots dont la date d'expiration manque : la réception ne peut pas être validée.
  const sansExpiration = lignes.filter(ligne => !ligne.expiresOn).length;

  const majRecuLe = (index, valeur) => maj(index, { receivedOn: valeur });

  /** Remplit la date d'expiration à partir de « Reçu le » + la durée choisie. */
  const appliquerDuree = (index, mois) => {
    const ligne = lignes[index];
    maj(index, { expiresOn: ajouterMois(ligne.receivedOn || today(), mois) });
  };

  const soumettre = async event => {
    event.preventDefault();
    setError(null);
    if (sansExpiration) {
      setError({ message: `Date d’expiration obligatoire : renseignez-la pour ${sansExpiration} lot(s) `
        + '(bouton de durée ou calendrier). Un lot sans date de péremption ne peut pas être réceptionné.' });
      return;
    }
    if (lignes.some(ligne => ligne.manufacturedOn && ligne.manufacturedOn > ligne.expiresOn)) {
      setError({ message: 'La date de fabrication ne peut pas être postérieure à la date d’expiration.' });
      return;
    }
    setBusy(true);
    try {
      const reception = await stock.createReceipt({
        requestKey: newRequestKey(),
        supplierId: Number(entete.supplierId),
        fees: String(entete.fees || '0'),
        note: entete.note,
        lines: lignes.map(ligne => ({
          productId: Number(ligne.productId),
          number: ligne.number,
          quantity: Number(ligne.quantity),
          purchasePrice: String(ligne.purchasePrice || '0'),
          receivedOn: ligne.receivedOn,
          expiresOn: ligne.expiresOn,
          manufacturedOn: ligne.manufacturedOn || null
        }))
      });
      onDone(reception);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={soumettre}>
      <ErrorBox error={error} />

      <div className="banner banner--info">
        Toute réception entre au <strong>dépôt</strong> (réserve). La pharmacie sera servie ensuite
        par un transfert : c’est ce qui permet à chaque magasin d’avoir son propre stock.
        <br />
        <strong>Le numéro du bon est attribué automatiquement</strong> à la validation
        (format <code>REC-AAAA-NNNNNN</code>) : il n’y a plus de numéro de facture à saisir.
      </div>

      <div className="grid grid--2">
        <Field label="Fournisseur">
          <Select value={entete.supplierId} onChange={e => setEntete({ ...entete, supplierId: e.target.value })} required>
            <option value="">— choisir dans la liste —</option>
            {suppliers.filter(s => s.active).map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </Select>
        </Field>
        <Field label="Frais de livraison, douane, transport" hint="Réparti sur toutes les unités reçues">
          <Input type="number" min="0" step="0.01" value={entete.fees} onChange={e => setEntete({ ...entete, fees: e.target.value })} />
        </Field>
      </div>

      <h3>Lots reçus</h3>
      <div className="stack">
        {lignes.map((ligne, index) => (
          <div className="card" key={index} style={{ padding: 12 }}>
            <div className="grid grid--3">
              <Field label="Médicament">
                <Select value={ligne.productId} onChange={e => maj(index, { productId: e.target.value, number: ligne.number || lotSuggere(e.target.value) })} required>
                  <option value="">— choisir dans la liste —</option>
                  {products.filter(p => p.active).map(product => (
                    <option key={product.id} value={product.id}>{product.name}{product.presentation ? ` · ${product.presentation}` : ''}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Numéro de lot"
                hint="Celui imprimé sur la boîte (proposé automatiquement). Réutiliser un numéro déjà reçu au même prix complète le lot ; à un autre prix, un second lot est créé automatiquement — la réception passe dans tous les cas.">
                <Input value={ligne.number} onChange={e => maj(index, { number: e.target.value })} required />
              </Field>
              <Field label="Quantité reçue">
                <Input type="number" min="1" step="1" value={ligne.quantity} onChange={e => maj(index, { quantity: e.target.value })} required />
              </Field>
              <Field label="Prix d’achat unitaire">
                <Input type="number" min="0" step="0.01" value={ligne.purchasePrice} onChange={e => maj(index, { purchasePrice: e.target.value })} required />
              </Field>
              <Field label="Reçu le">
                <Input type="date" value={ligne.receivedOn} onChange={e => majRecuLe(index, e.target.value)} required />
              </Field>
              <Field label="Date d’expiration *" hint="Obligatoire : c’est elle qui déclenche l’alerte de péremption">
                <Input type="date" value={ligne.expiresOn} min={ligne.receivedOn || undefined}
                  aria-invalid={ligne.expiresOn ? undefined : true}
                  style={ligne.expiresOn ? undefined : { borderColor: '#b91c1c' }}
                  onChange={e => maj(index, { expiresOn: e.target.value })} required />
              </Field>
            </div>

            <div className="row" style={{ flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: '.82rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={15} /> Raccourci (à partir de « Reçu le ») :
              </span>
              {DUREES.map(duree => (
                <Btn key={duree.mois} variant="ghost" type="button" onClick={() => appliquerDuree(index, duree.mois)}>
                  {duree.label}
                </Btn>
              ))}
              <span className="muted" style={{ fontSize: '.82rem' }}>
                {ligne.expiresOn
                  ? <>Péremption retenue : <strong>{dateFr(ligne.expiresOn)}</strong> — le lot n’est plus vendable après cette date.</>
                  : <span style={{ color: '#b91c1c' }}>Aucune date : impossible de valider la réception.</span>}
              </span>
            </div>

            <div className="row" style={{ marginTop: 8 }}>
              <Field label="Fabriqué le" hint="Facultatif" className="field">
                <Input type="date" value={ligne.manufacturedOn}
                  max={ligne.expiresOn || undefined}
                  onChange={e => maj(index, { manufacturedOn: e.target.value })} />
              </Field>
              <div className="spacer" />
              <Btn variant="ghost" icon={Trash2} type="button" disabled={lignes.length === 1}
                onClick={() => setLignes(liste => liste.filter((_, i) => i !== index))}>Retirer ce lot</Btn>
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <Btn icon={Plus} type="button" onClick={() => setLignes(liste => [...liste, ligneVide()])}>Ajouter un lot</Btn>
        <span className="muted" style={{ fontSize: '.84rem' }}>
          {unites} unité(s) · {money(total)} de marchandise · coût de revient estimé {money(coutUnitaireMoyen)} / unité
          (frais inclus). Le prix de vente est calculé par le serveur avec la marge paramétrée.
        </span>
      </div>

      <Field label="Remarque">
        <Textarea value={entete.note} onChange={e => setEntete({ ...entete, note: e.target.value })} placeholder="État du colis, écarts constatés, numéro de scellé…" />
      </Field>

      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <Btn variant="ghost" type="button" onClick={onCancel}>Renoncer</Btn>
        <Btn variant="primary" type="submit" icon={PackagePlus} disabled={busy || sansExpiration > 0}>
          {busy ? 'Enregistrement…' : 'Valider la réception'}
        </Btn>
      </div>
    </form>
  );
}