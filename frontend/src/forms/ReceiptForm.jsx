// Réception de marchandise AU DÉPÔT : création des lots, frais AUTOMATIQUES
// (% du PA réglé dans Paramètres, 2.7.47), calcul du coût de revient, mise à
// jour du CMP et du prix de vente.
//
// Règles de l'écran (version 2.7.1) :
//   • plus de numéro de facture à saisir : le numéro du bon de réception
//     (REC-AAAA-NNNNNN) est attribué AUTOMATIQUEMENT par le serveur ;
//   • la DATE D'EXPIRATION est obligatoire, lot par lot. Les boutons de durée
//     (6 mois, 1 an, 18 mois, 2 ans, 3 ans) ne font que remplir la date : la
//     valeur enregistrée est toujours une date précise, jamais une durée.
// Le passage vers la pharmacie se fait ensuite par un transfert, depuis l'écran
// « Transferts dépôt → pharmacie ».
//
// 2.7.78 — TEXTES ENLEVÉS (demande de l'officine, formulaire épuré) : la
//   bannière bleue d'introduction (« Toute réception entre au dépôt… », « Le
//   numéro du bon est attribué automatiquement… »), les consignes sous les
//   champs (« Appliqués par le serveur sur chaque prix d'achat… », « Survolez
//   un nom dans la liste… », « Boîte, flacon, pièce, plaquette… », « Celui
//   imprimé sur la boîte (proposé automatiquement)… », « Obligatoire : c'est
//   elle qui déclenche l'alerte… », « Facultatif — lot par lot… »), la ligne
//   récapitulative (« N unité(s) · … Ar de marchandise · coût de revient
//   estimé… ») et le libellé « Raccourci (à partir de "Reçu le") » sont tous
//   RETIRÉS. Les champs, le calcul serveur et la validation ne changent PAS.
import { useState } from 'react';
import { Plus, Trash2, PackagePlus } from 'lucide-react';
import { stock } from '../api/endpoints.js';
import { newRequestKey } from '../api/client.js';
import { Btn, ErrorBox, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { useData } from '../context/DataContext.jsx';
import { today } from '../utils/format.js';

const ligneVide = () => ({
  productId: '', number: '', quantity: 1, purchasePrice: '',
  // 2.7.49 — « Fabriquant » (texte) remplace « Fabriqué le » (date), retirée du
  // formulaire : le fabricant se saisit lot par lot, à la réception.
  receivedOn: today(), expiresOn: '', manufacturer: '', unit: ''
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

// 2.7.31 — l'« Unité de gestion » quitte la fiche médicament et se choisit
// ICI, à la réception (demande du dépôt) : liste déroulante fixe. Elle est
// reportée sur la fiche du médicament — une seule unité par produit, pour que
// stocks, CMP et prix restent cohérents.
// 2.7.83 — ENRICHIE sur demande du dépôt : Boîte, Plaquette, Flacon,
// Comprimé, Ampoule, Rouleau, Carton, ml, cm (« pièce » retirée de la liste
// — les lignes déjà enregistrées avec une ancienne unité gardent leur valeur,
// affichée en plus au besoin par le repli juste en-dessous).
const UNITES_GESTION = ['boîte', 'plaquette', 'flacon', 'comprimé', 'ampoule', 'rouleau', 'carton', 'ml', 'cm'];

export default function ReceiptForm({ onDone, onCancel, correction = null }) {
  const { products, suppliers, lots, settings } = useData();
  // 2.7.34 — teboka ③ : mode CORRECTION. Le formulaire s'ouvre pré-rempli
  // avec le contenu actuel de la réception ; l'envoi ne modifie RIEN tout de
  // suite : la proposition part chez l'administrateur qui la valide ou la
  // refuse (la réception ne bouge qu'après sa décision).
  // 2.7.47 — plus de frais saisis : le serveur applique le taux automatique
  // « Frais d'achat » (feesRate % du PA) des Paramètres, 10 % par défaut.
  const [entete, setEntete] = useState(() => (correction
    ? {
        supplierId: String(correction.receipt.supplierId || ''),
        note: correction.receipt.note || ''
      }
    : { supplierId: '', note: '' }));
  const tauxFrais = Number(settings?.feesRate ?? 10);
  const [lignes, setLignes] = useState(() => {
    if (!correction) return [ligneVide()];
    return correction.lignes.map(ligne => {
      const produit = products.find(p => Number(p.id) === Number(ligne.productId));
      return {
        productId: String(ligne.productId),
        number: ligne.number,
        quantity: Number(ligne.quantity),
        purchasePrice: String(Number(ligne.purchasePrice ?? 0)),
        receivedOn: String(ligne.receivedOn || today()).slice(0, 10),
        expiresOn: ligne.expiresOn ? String(ligne.expiresOn).slice(0, 10) : '',
        manufacturer: ligne.manufacturer || '',
        unit: produit?.unit || 'boîte'
      };
    });
  });
  const [motif, setMotif] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Numéro de lot proposé automatiquement : code du médicament + année (modifiable).
  const lotSuggere = productId => {
    const produit = products.find(p => Number(p.id) === Number(productId));
    return produit ? `${produit.code}-${new Date().getFullYear()}` : '';
  };

  const maj = (index, patch) => setLignes(liste => liste.map((ligne, i) => (i === index ? { ...ligne, ...patch } : ligne)));

  // 2.7.31 — stock TOTAL du médicament au dépôt (toutes unités confondues),
  // affiché au survol du nom dans la liste et, après choix, avant/après.
  const stockDepot = productId => lots
    .filter(lot => Number(lot.productId) === Number(productId) && lot.location === 'DEPOT')
    .reduce((somme, lot) => somme + Number(lot.quantity || 0), 0);
  const produitDe = productId => products.find(p => Number(p.id) === Number(productId));

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
    if (correction && motif.trim().length < 3) {
      setError({ message: 'Le motif de la correction est obligatoire (3 caractères minimum) : l’administrateur le lira pour trancher.' });
      return;
    }
    setBusy(true);
    try {
      const corps = {
        supplierId: Number(entete.supplierId),
        note: entete.note,
        lines: lignes.map(ligne => ({
          productId: Number(ligne.productId),
          number: ligne.number,
          quantity: Number(ligne.quantity),
          purchasePrice: String(ligne.purchasePrice || '0'),
          receivedOn: ligne.receivedOn,
          expiresOn: ligne.expiresOn,
          manufacturer: ligne.manufacturer.trim(),
          unit: ligne.unit || undefined
        }))
      };
      // Teboka ③ : en mode correction, la proposition est adressée à
      // l'administrateur — la réception ne change qu'après sa validation.
      const reception = correction
        ? await stock.proposerCorrection(correction.receipt.id, { ...corps, reason: motif.trim() })
        : await stock.createReceipt({ requestKey: newRequestKey(), ...corps });
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

      {/* 2.7.78 — la bannière d'introduction (« Toute réception entre au
          dépôt… », « Le numéro du bon est attribué automatiquement… ») est
          RETIRÉE ; la bannière de CORRECTION, elle, reste (elle explique le
          geste en cours : adressée à l'administrateur). */}
      {correction ? (
        <div className="banner banner--warn">
          <strong>Correction de la réception {correction.receipt.reference}</strong> — modifiez les valeurs,
          expliquez le motif, puis envoyez : <strong>un administrateur valide ou refuse</strong>.
          La réception ne change qu’après sa décision (impossible si un lot a déjà bougé :
          transfert, vente, perte ou inventaire — il faudra alors annuler le document).
        </div>
      ) : null}

      <div className="grid grid--2">
        <Field label="Fournisseur">
          <Select value={entete.supplierId} onChange={e => setEntete({ ...entete, supplierId: e.target.value })} required>
            <option value="">— choisir dans la liste —</option>
            {suppliers.filter(s => s.active).map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </Select>
        </Field>
        {/* 2.7.47 — les frais sont AUTOMATIQUES (feesRate % du PA, réglé par
            l'administrateur dans Paramètres) : plus aucun montant à saisir ici.
            (2.7.78 : la consigne détaillée sous le champ est retirée.) */}
        <Field label="Frais d'achat (automatiques)">
          <Input value={`${tauxFrais} % du prix d'achat (Paramètres)`} readOnly />
        </Field>
      </div>

      <h3>Lots reçus</h3>
      <div className="stack">
        {lignes.map((ligne, index) => (
          <div className="card" key={index} style={{ padding: 12 }}>
            <div className="grid grid--3">
              <Field label="Médicament"
                hint={ligne.productId
                  ? `Stock actuel au dépôt : ${stockDepot(ligne.productId)} ${(ligne.unit || produitDe(ligne.productId)?.unit) ?? 'unité'} — après cette réception : ${stockDepot(ligne.productId) + Number(ligne.quantity || 0)}.`
                  : undefined}>
                <Select value={ligne.productId} onChange={e => maj(index, {
                  productId: e.target.value,
                  number: ligne.number || lotSuggere(e.target.value),
                  unit: produitDe(e.target.value)?.unit || 'boîte'
                })} required>
                  <option value="">— choisir dans la liste —</option>
                  {products.filter(p => p.active).map(product => (
                    <option key={product.id} value={product.id}
                      title={`${product.name} — stock actuel au dépôt : ${stockDepot(product.id)} ${product.unit || 'unité'}`}>
                      {product.name}{product.presentation ? ` · ${product.presentation}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              {/* 2.7.78 — les consignes sous les champs (« Boîte, flacon,
                  pièce, plaquette… », « Celui imprimé sur la boîte… »,
                  « Obligatoire : c'est elle qui déclenche… ») sont retirées. */}
              <Field label="Unité de gestion">
                <Select value={ligne.unit || 'boîte'} onChange={e => maj(index, { unit: e.target.value })}>
                  {UNITES_GESTION.map(u => <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>)}
                  {ligne.unit && !UNITES_GESTION.includes(ligne.unit) ? <option value={ligne.unit}>{ligne.unit}</option> : null}
                </Select>
              </Field>
              <Field label="Numéro de lot">
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
              <Field label="Date d’expiration *">
                <Input type="date" value={ligne.expiresOn} min={ligne.receivedOn || undefined}
                  aria-invalid={ligne.expiresOn ? undefined : true}
                  style={ligne.expiresOn ? undefined : { borderColor: '#b91c1c' }}
                  onChange={e => maj(index, { expiresOn: e.target.value })} required />
              </Field>
            </div>

            {/* 2.7.78 — le libellé « Raccourci (à partir de « Reçu le ») : »
                est retiré ; les boutons de durée remplissent toujours la date. */}
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
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
              {/* 2.7.49 — fabricant saisi lot par lot (2.7.78 : consigne retirée). */}
              <Field label="Fabriquant" className="field">
                <Input value={ligne.manufacturer} maxLength={150}
                  placeholder="Ex. Sanofi, Biogaran, Cipla…"
                  title="Nom du fabricant/fabriquant DE CE LOT — saisi à la réception, il suit le lot partout"
                  onChange={e => maj(index, { manufacturer: e.target.value })} />
              </Field>
              <div className="spacer" />
              <Btn variant="ghost" icon={Trash2} type="button" disabled={lignes.length === 1}
                onClick={() => setLignes(liste => liste.filter((_, i) => i !== index))}>Retirer ce lot</Btn>
            </div>
          </div>
        ))}
      </div>

      {/* 2.7.78 — la ligne récapitulative (« N unité(s) · … Ar de marchandise ·
          coût de revient estimé … ») est RETIRÉE : le serveur fait toujours
          le calcul (frais automatiques, CMP, prix de vente) à la validation. */}
      <div className="row" style={{ marginTop: 10 }}>
        <Btn icon={Plus} type="button" onClick={() => setLignes(liste => [...liste, ligneVide()])}>Ajouter un lot</Btn>
      </div>

      <Field label="Remarque">
        <Textarea value={entete.note} onChange={e => setEntete({ ...entete, note: e.target.value })} placeholder="État du colis, écarts constatés, numéro de scellé…" />
      </Field>

      {correction ? (
        <Field label="Motif de la correction *" hint="Obligatoire : lu par l’administrateur pour décider">
          <Textarea value={motif} onChange={e => setMotif(e.target.value)}
            placeholder="Ex. : erreur de saisie sur la quantité du lot MED-001, bon de livraison rectifié par le fournisseur…" />
        </Field>
      ) : null}

      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <Btn variant="ghost" type="button" onClick={onCancel}>Renoncer</Btn>
        <Btn variant="primary" type="submit" icon={PackagePlus}
          disabled={busy || sansExpiration > 0 || (correction && motif.trim().length < 3)}>
          {busy
            ? 'Envoi…'
            : correction
              ? 'Envoyer la correction à l’administrateur'
              : 'Valider la réception'}
        </Btn>
      </div>
    </form>
  );
}