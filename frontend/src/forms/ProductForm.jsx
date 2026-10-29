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
//     plaquette ; 0 plaquette = vente à la boîte seule ;
//   • PRIX DÉTAILLÉS indépendants : à 0, le serveur calcule automatiquement au
//     prorata du prix de la boîte au moment de la vente (prix boîte ÷
//     plaquettes, puis ÷ comprimé) ; sinon l'officine saisit le prix réel.
//
// 2.7.78 — formulaire épuré (demande de l'officine) :
//   • les 4 cases « Vente au détail » (plaquettes par boîte, comprimé par
//     plaquette, prix d'une plaquette, prix d'un comprimé) NE SONT PLUS
//     AFFICHÉES — la bannière bleue qui les expliquait part avec, ainsi que
//     leurs consignes. Les valeurs RESTENT dans la fiche et continuent d'être
//     ENVOYÉES au serveur (le conditionnement existant n'est jamais perdu :
//     la vente au détail fonctionne comme avant, elle se règle au besoin par
//     l'équipe) ;
//   • « Renoncer » devient « Retour », bouton ROUGE plein (famille annulation,
//     comme le « Fermer » des boîtes de dialogue).
//
// 2.7.89 — « Présentation » RETIRÉE du formulaire (demande de l'officine) :
//   elle ne se saisit plus dans le Catalogue — elle se règle À LA RÉCEPTION
//   (champ « Présentation » de « Nouvelle réception ») et s'affiche
//   automatiquement dans le catalogue sous le nom du médicament. La valeur
//   existante de la fiche est CONSERVÉE à l'enregistrement (l'état la garde,
//   le payload la renvoie telle quelle).
import { useState } from 'react';
import { referentials } from '../api/endpoints.js';
import { Banner, Btn, Check, ErrorBox, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { useData } from '../context/DataContext.jsx';

const vide = {
  name: '', presentation: '', categoryId: '', unit: 'boîte', minStock: 5, maxStock: '',
  // 2.7.49 — « Nom de Fabriquant » retiré de la fiche : il se saisit lot par
  // lot à la réception (« Nouvelle réception »), pas sur le médicament.
  note: '', active: true, marginRate: 20,
  // 2.7.78 — conditionnement et prix au détail : conservés dans l'état et
  // ENVOYÉS au serveur, mais plus saisis ici (cases retirées du formulaire).
  blistersPerBox: 10, unitsPerBlister: 10, pricePerBlister: 0, pricePerUnit: 0
};

export default function ProductForm({ produit, onDone, onCancel }) {
  const { categories, settings } = useData();
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
  // 2.7.48 — la marge est le TAUX UNIQUE des Paramètres (minMargin = maxMargin
  // = le taux réglé par l'administrateur) : elle s'applique à tous les
  // médicaments, aucune valeur libre ici.
  } : { ...vide, marginRate: Number(settings.minMargin ?? 20) });
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
        // 2.7.89 — la présentation n'est plus saisie dans ce formulaire : elle
        // vient de la RÉCEPTION et s'affiche automatiquement au catalogue. La
        // valeur de la fiche est RENVOYÉE telle quelle pour ne jamais l'effacer
        // lors d'une simple modification de fiche.
        presentation: values.presentation || '',
        categoryId: values.categoryId ? Number(values.categoryId) : null,
        // 2.7.31 — l'unité n'est plus saisie ici. 2.7.90 — fiche NOUVELLE :
        // unité VIDE — l'écran Stock l'affiche vide (demande du dépôt) et la
        // PREMIÈRE réception la fixe automatiquement (celle saisie à la
        // réception). En modification, la valeur existante est conservée.
        unit: produit ? (values.unit || '') : '',
        minStock: Number(values.minStock || 0),
        maxStock: values.maxStock === '' ? null : Number(values.maxStock),
        note: values.note || '',
        active: Boolean(values.active),
        marginRate: Number(values.marginRate || 0),
        // 2.7.12 — conditionnement et prix au détail : 2.7.78 les envoie
        // TOUJOURS (les cases ont quitté l'écran, pas la fiche : les valeurs
        // déjà réglées continuent de s'appliquer à la vente au détail).
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
        {/* 2.7.89 — « Présentation » RETIRÉE du formulaire (demande de
            l'officine) : elle ne se saisit plus ICI. Elle vient de la
            RÉCEPTION (« Nouvelle réception », champ Présentation) et s'affiche
            automatiquement dans le catalogue (colonne « Médicament » : nom en
            gras, présentation dessous). La valeur existante de la fiche est
            CONSERVÉE : elle reste dans l'état et est renvoyée au serveur à
            l'enregistrement (une modification de la désignation n'efface
            jamais la présentation reçue). */}
        {/* 2.7.31 — « Unité de gestion » n'est plus ici : elle se choisit
            dans « Nouvelle réception » (boîte, flacon, pièce, plaquette). */}
        <Field label="Seuil d’alerte (stock minimum)" hint="Le stock maximum proposé est 30 fois ce seuil (modifiable)">
          <Input type="number" min="0" step="1" value={values.minStock}
            onChange={e => maj({ minStock: e.target.value, maxStock: Number(e.target.value) * 30 })} />
        </Field>
        <Field label="Stock maximum (surstock)" hint="Facultatif">
          <Input type="number" min="0" step="1" value={values.maxStock} onChange={e => maj({ maxStock: e.target.value })} />
        </Field>
        {/* 2.7.48 — taux UNIQUE en lecture seule : le taux réglé par
            l'administrateur dans Paramètres s'applique à tout le catalogue ;
            on l'affiche ici, on ne le saisit plus fiche par fiche. */}
        <Field label="Taux de marge (%)" hint="Taux unique réglé dans Paramètres (administrateur) — il s’applique à tous les médicaments">
          <Input value={`${Number(settings.minMargin ?? values.marginRate)} % (Paramètres)`} readOnly />
        </Field>
      </div>

      {/* 2.7.78 — les 4 cases « Vente au détail » (conditionnement et prix
          d'une plaquette / d'un comprimé) et leur bannière bleue sont RETIRÉES
          de l'écran ; les valeurs restent dans l'état et sont toujours ENVOYÉES
          au serveur (blistersPerBox, unitsPerBlister, pricePerBlister,
          pricePerUnit) : la vente au détail continue de fonctionner avec le
          conditionnement déjà enregistré. */}

      <Field label="Note interne"><Textarea value={values.note} onChange={e => maj({ note: e.target.value })} /></Field>

      <Check label="Médicament actif (proposé à la vente)" checked={Boolean(values.active)}
        onChange={e => maj({ active: e.target.checked })} />

      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        {/* 2.7.78 — « Retour » ROUGE plein (famille annulation), comme le
            « Fermer » des boîtes de dialogue. */}
        <Btn variant="danger" onClick={onCancel}>Retour</Btn>
        <Btn variant="primary" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Btn>
      </div>
    </form>
  );
}