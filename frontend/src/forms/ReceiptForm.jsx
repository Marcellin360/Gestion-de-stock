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
//   bannière bleue d'introduction, les consignes sous les champs, la ligne
//   récapitulative et le libellé « Raccourci… » sont tous RETIRÉS. Les champs,
//   le calcul serveur et la validation ne changent PAS.
//
// 2.7.83 — LISTE D'UNITÉS ENRICHIE (neuf choix) — voir UNITES_GESTION.
//
// 2.7.84 — PRÉSENTATION PAR FICHE + CONDITIONNEMENT (grande refonte, demande
//   du dépôt) :
//   ① le couple (Médicament + Présentation) identifie LA FICHE : « Alcool
//     médical · Flacon 100 ml » et « Alcool médical · Flacon 250 ml » ne se
//     mélangent JAMAIS (stock, CMP et prix propres à chacune) ; une
//     présentation inconnue crée la fiche AUTOMATIQUEMENT à la validation ;
//   ② la livraison se saisit en UNITÉ D'ACHAT (ex. 2 cartons à 80 000 Ar) :
//     la « chaîne de conditionnement » (1 carton = N boîtes, 1 boîte = N
//     plaquettes, 1 flacon = 250 ml, 1 rouleau = 500 cm…) convertit en unité
//     de GESTION — ces nombres ne sont pas fixes : ils se réglent ligne par
//     ligne, sont MÉMORISÉS sur la fiche et re-proposés à la réception
//     suivante ;
//   ③ sans conversion nécessaire (achat = gestion), tout reste comme avant.
//
// 2.7.97 — « Catégorie » et « Unité de gestion » ne sont PLUS JAMAIS
//   VERROUILLÉES (demande de l'officine) : quand la fiche existe, elles sont
//   simplement PRÉ-REMPLIES avec ses valeurs — automatiques — et restent
//   MODIFIABLES. Le choix fait à la réception est répercuté sur la fiche par
//   le serveur (categoryId directement ; unité si elle figure dans la chaîne
//   de conditionnement, sinon refus guidé). Seul le mode CORRECTION conserve
//   les champs verrouillés (l'identité du lot ne se retouche pas).
import { useState } from 'react';
import { Plus, Trash2, PackagePlus, PackageOpen } from 'lucide-react';
import { stock } from '../api/endpoints.js';
import { newRequestKey } from '../api/client.js';
import { Btn, ErrorBox, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { useData } from '../context/DataContext.jsx';
import { today } from '../utils/format.js';
// 2.7.84 — lecture de la chaîne de conditionnement et facteurs (mêmes règles
// que le serveur ; utils/unites.js).
import { chaineEffective, facteurEntre } from '../utils/unites.js';

const ligneVide = () => ({
  // 2.7.84 — la ligne identifie la fiche par (baseName + presentation) ;
  // productId est résolu automatiquement quand la fiche existe déjà.
  baseName: '', presentation: '', productId: '',
  // 2.7.85 — la catégorie revient au formulaire (elle figurait avant la
  // refonte 2.7.84) : pré-remplie depuis les fiches du même nom, modifiable ;
  // elle n'est ENREGISTRÉE que lors de la création d'une nouvelle présentation.
  categoryId: '',
  unit: 'boîte', purchaseUnit: 'boîte',
  conversions: [],                       // chaîne : [{ from, to, count }]
  number: '', quantity: 1, purchasePrice: '',
  // 2.7.49 — « Fabriquant » (texte) remplace « Fabriqué le » (date), retirée du
  // formulaire : le fabricant se saisit lot par lot, à la réception.
  receivedOn: today(), expiresOn: '', manufacturer: ''
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
// Comprimé, Ampoule, Rouleau, Carton, ml, cm (les lignes déjà enregistrées
// avec une unité ancienne gardent leur valeur, affichée en plus au besoin
// par le repli juste en-dessous).
// 2.7.84 — la même liste sert aussi aux unités d'ACHAT (carton…) et aux
// maillons de la chaîne de conditionnement.
// 2.7.94 — « sachet » et « pièce » REJOIGNENT la liste (demande du dépôt) :
// proposées à l'unité de GESTION comme à l'unité d'ACHAT et à la chaîne de
// conditionnement — la même liste sert aux menus déroulants (2.7.84).
// 2.7.96 — « paire » (gants) et « tube » (crème) REJOIGNENT à leur tour la
// liste (validation de la stratégie tarifs de l'officine) : même portée aux
// trois menus (gestion, achat, chaîne) ; le pluriel « paires » / « tubes »
// est déjà couvert par pluraliseUnite (utils/unites.js — règle générale).
// Côté serveur rien ne change : l'unité est un texte libre (pas d'énumération).
const UNITES_GESTION = ['boîte', 'plaquette', 'flacon', 'comprimé', 'ampoule', 'rouleau', 'carton', 'sachet', 'pièce', 'paire', 'tube', 'ml', 'cm'];

/** Première lettre en capitale pour l'affichage des unités. */
const cap = u => (u ? u.charAt(0).toUpperCase() + u.slice(1) : u);

export default function ReceiptForm({ onDone, onCancel, correction = null }) {
  const { products, suppliers, categories, lots, settings } = useData();
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
        baseName: produit?.name || '',
        presentation: produit?.presentation || '',
        productId: String(ligne.productId),
        categoryId: produit?.categoryId ? String(produit.categoryId) : '',   // 2.7.85
        // En correction, la quantité reste dans l'unité de GESTION (inchangé) :
        // la conversion achat → gestion ne s'applique qu'aux nouvelles entrées.
        unit: produit?.unit || 'boîte',
        purchaseUnit: produit?.unit || 'boîte',
        conversions: chaineEffective(produit || {}),
        number: ligne.number,
        quantity: Number(ligne.quantity),
        purchasePrice: String(Number(ligne.purchasePrice ?? 0)),
        receivedOn: String(ligne.receivedOn || today()).slice(0, 10),
        expiresOn: ligne.expiresOn ? String(ligne.expiresOn).slice(0, 10) : '',
        manufacturer: ligne.manufacturer || ''
      };
    });
  });
  const [motif, setMotif] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // 2.7.84 — noms de base DISTINCTS des fiches actives (le dépôt choisit
  // d'abord le médicament, puis sa présentation séparément).
  const nomsDistincts = [...new Set(products.filter(p => p.active).map(p => p.name))]
    .sort((a, b) => String(a).localeCompare(String(b), 'fr'));
  /** Fiches actives d'un nom de base (les différentes présentations). */
  const fichesDe = baseName => products.filter(p => p.active && p.name === baseName);
  /** Fiche exacte d'un couple (nom, présentation) — insensible à la casse. */
  const ficheDe = (baseName, presentation) => fichesDe(baseName).find(p =>
    String(p.presentation || '').trim().toLowerCase() === String(presentation || '').trim().toLowerCase());

  // Numéro de lot proposé automatiquement : code du médicament + année (modifiable).
  const lotSuggere = (baseName, presentation) => {
    const produit = ficheDe(baseName, presentation) || fichesDe(baseName)[0];
    return produit ? `${produit.code}-${new Date().getFullYear()}` : '';
  };

  const maj = (index, patch) => setLignes(liste => liste.map((ligne, i) => (i === index ? { ...ligne, ...patch } : ligne)));

  /** 2.7.84 — choix du médicament : pré-remplit présentation / unités / chaîne
   *  depuis la fiche quand elle est unique, sinon laisse la présentation à
   *  préciser (datalist des présentations connues de ce nom). */
  const choisirMedicament = (index, baseName) => {
    const fiches = fichesDe(baseName);
    const unique = fiches.length === 1 ? fiches[0] : null;
    maj(index, {
      baseName,
      presentation: unique ? (unique.presentation || '') : '',
      productId: unique ? String(unique.id) : '',
      // 2.7.85 — catégorie pré-remplie : celle de la fiche exacte, sinon celle
      // d'une autre présentation du même médicament (même famille logique).
      categoryId: (unique || fiches[0])?.categoryId ? String((unique || fiches[0]).categoryId) : '',
      unit: unique?.unit || 'boîte',
      purchaseUnit: unique?.purchaseUnit || unique?.unit || 'boîte',
      conversions: unique ? chaineEffective(unique) : [],
      number: unique ? lotSuggere(baseName, unique.presentation || '') : ''
    });
  };

  /** 2.7.84 — saisie de la présentation : si le couple existe, tout se verrouille
   *  sur la fiche (unité de gestion fixe, chaîne re-proposée) ; sinon la fiche
   *  sera créée à la validation avec les réglages saisis ici. */
  const choisirPresentation = (index, presentation) => {
    const ligne = lignes[index];
    const fiche = ficheDe(ligne.baseName, presentation);
    maj(index, {
      presentation,
      productId: fiche ? String(fiche.id) : '',
      // 2.7.85 — fiche connue : SA catégorie s'affiche ; nouvelle présentation :
      // la catégorie choisie reste (pré-remplie au choix du médicament).
      categoryId: fiche?.categoryId ? String(fiche.categoryId) : (fiche ? '' : ligne.categoryId),
      // 2.7.90 — fiche connue mais SANS unité encore fixée (créée au
      // Catalogue, jamais réceptionnée) : on n'écrase PAS la ligne par une
      // chaîne vide — l'unité reste choisissable et c'est CETTE réception qui
      // la posera sur la fiche (le serveur l'écrit, 2.7.90).
      unit: fiche ? (fiche.unit || ligne.unit || 'boîte') : ligne.unit,
      purchaseUnit: fiche ? (fiche.purchaseUnit || fiche.unit || ligne.purchaseUnit) : ligne.purchaseUnit,
      conversions: fiche ? chaineEffective(fiche) : ligne.conversions,
      number: ligne.number || lotSuggere(ligne.baseName, presentation)
    });
  };

  /** Maillons de la chaîne : ajout / retrait / modification. */
  const majMaillon = (index, rang, patch) => {
    const conversions = lignes[index].conversions.map((m, i) => (i === rang ? { ...m, ...patch } : m));
    maj(index, { conversions });
  };
  const ajouterMaillon = index => maj(index, {
    conversions: [...lignes[index].conversions, { from: lignes[index].purchaseUnit || 'carton', to: lignes[index].unit || 'boîte', count: 1 }]
  });
  const retirerMaillon = (index, rang) => maj(index, {
    conversions: lignes[index].conversions.filter((_, i) => i !== rang)
  });

  /** Facteur de conversion achat → gestion pour la ligne (null = manquant). */
  const facteurAchat = ligne => {
    const achat = String(ligne.purchaseUnit || '').toLowerCase();
    const gestion = String(ligne.unit || '').toLowerCase();
    if (!achat || achat === gestion) return 1;
    return facteurEntre(ligne.conversions, achat, gestion);
  };

  // 2.7.31 — stock TOTAL du médicament au dépôt (toutes unités confondues),
  // affiché au survol du nom dans la liste et, après choix, avant/après.
  const stockDepot = productId => lots
    .filter(lot => Number(lot.productId) === Number(productId) && lot.location === 'DEPOT')
    .reduce((somme, lot) => somme + Number(lot.quantity || 0), 0);

  // Lots dont la date d'expiration manque : la réception ne peut pas être validée.
  const sansExpiration = lignes.filter(ligne => !ligne.expiresOn).length;
  // 2.7.84 — conversion achat → gestion obligatoire dès que les deux unités
  // diffèrent : sans maillon qui les relie, la quantité en stock serait fausse.
  const conversionManquante = lignes.filter(ligne => facteurAchat(ligne) == null).length;

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
    if (conversionManquante) {
      setError({ message: `Conditionnement incomplet : précisez la conversion achat → gestion `
        + `pour ${conversionManquante} ligne(s) (ex. « 1 carton = N boîtes ») avant de valider.` });
      return;
    }
    if (lignes.some(ligne => !ligne.baseName || !(ligne.productId || ligne.presentation.trim()))) {
      setError({ message: 'Chaque ligne doit désigner une fiche existante (médicament + présentation) '
        + 'ou nommer une NOUVELLE présentation (la fiche sera créée à la validation).' });
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
          // 2.7.84 — la fiche est identifiée par productId quand elle existe,
          // sinon par (baseName + presentation) : le serveur la crée alors.
          productId: ligne.productId ? Number(ligne.productId) : undefined,
          baseName: ligne.baseName,
          presentation: ligne.presentation.trim(),
          categoryId: ligne.categoryId ? Number(ligne.categoryId) : undefined,   // 2.7.85
          unit: ligne.unit || undefined,
          purchaseUnit: ligne.purchaseUnit || undefined,
          conversions: ligne.conversions.length ? ligne.conversions : undefined,
          number: ligne.number,
          // quantity = quantité ACHETÉE dans l'unité d'achat ; purchasePrice =
          // prix par unité d'achat — le serveur convertit en unité de gestion.
          quantity: Number(ligne.quantity),
          purchasePrice: String(ligne.purchasePrice || '0'),
          receivedOn: ligne.receivedOn,
          expiresOn: ligne.expiresOn,
          manufacturer: ligne.manufacturer.trim()
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

      {/* 2.7.78 — la bannière d'introduction est retirée ; la bannière de
          CORRECTION, elle, reste (elle explique le geste en cours). */}
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
            l'administrateur dans Paramètres) : plus aucun montant à saisir ici. */}
        <Field label="Frais d'achat (automatiques)">
          <Input value={`${tauxFrais} % du prix d'achat (Paramètres)`} readOnly />
        </Field>
      </div>

      <h3>Lots reçus</h3>
      <div className="stack">
        {lignes.map((ligne, index) => {
          const fiche = ligne.productId ? products.find(p => Number(p.id) === Number(ligne.productId)) : null;
          const facteur = facteurAchat(ligne);
          const quantiteGestion = facteur ? Number(ligne.quantity || 0) * facteur : 0;
          const prixGestion = facteur && Number(ligne.purchasePrice) > 0
            ? Number(ligne.purchasePrice) / facteur : null;
          const correctionMode = Boolean(correction);
          return (
            <div className="card" key={index} style={{ padding: 12 }}>
              <div className="grid grid--3">
                {/* 2.7.84 — le médicament se choisit par son NOM DE BASE… */}
                <Field label="Médicament"
                  hint={fiche
                    ? `Stock actuel au dépôt : ${stockDepot(fiche.id)} ${ligne.unit || fiche.unit || 'unité'} — après cette réception : ${stockDepot(fiche.id) + quantiteGestion}.`
                    : undefined}>
                  <Select value={ligne.baseName} onChange={e => choisirMedicament(index, e.target.value)} required
                    disabled={correctionMode}>
                    <option value="">— choisir dans la liste —</option>
                    {nomsDistincts.map(nom => {
                      const product = fichesDe(nom)[0];
                      return (
                        <option key={nom} value={nom}
                          title={`${product.name} — stock actuel au dépôt : ${fichesDe(nom).reduce((s, p) => s + stockDepot(p.id), 0)} ${product.unit || 'unité'}`}>
                          {product.name}
                        </option>
                      );
                    })}
                  </Select>
                </Field>
                {/* 2.7.84 — …puis sa PRÉSENTATION (« Flacon 250 ml », « Boîte de
                    100 gants taille M »). Jamais de mélange : chaque présentation
                    a sa propre fiche (stock, CMP, prix). Fiche inconnue → créée
                    automatiquement à la validation. */}
                <Field label="Présentation"
                  hint={ligne.baseName
                    ? (fiche
                      ? (fiche.presentation ? '' : undefined)
                      : (ligne.presentation.trim()
                        ? (fichesDe(ligne.baseName).some(p => !String(p.presentation || '').trim())
                          // 2.7.90 — la fiche du Catalogue (sans présentation)
                          // est ADOPTÉE : elle reçoit cette présentation, son
                          // stock grandit — AUCUNE autre fiche n'est créée.
                          ? `La fiche « ${ligne.baseName} » existe déjà : elle reçoit cette présentation et son stock grandit (aucune autre fiche créée).`
                          : `Nouvelle présentation : la fiche « ${ligne.baseName} · ${ligne.presentation.trim()} » sera créée automatiquement.`)
                        : 'Ex. : Flacon 250 ml, Boîte de 20 comprimés, Boîte de 100 gants taille M…'))
                    : undefined}>
                  <Input value={ligne.presentation} onChange={e => choisirPresentation(index, e.target.value)}
                    list={`presentations-${index}`} maxLength={150}
                    placeholder="Ex. Flacon 250 ml"
                    disabled={correctionMode}
                    required={!ligne.productId} />
                  <datalist id={`presentations-${index}`}>
                    {[...new Set(fichesDe(ligne.baseName).map(p => p.presentation || '').filter(Boolean))]
                      .map(pres => <option key={pres} value={pres} />)}
                  </datalist>
                </Field>
                {/* 2.7.85 — la CATÉGORIE revient au formulaire (elle y figurait
                    avant la refonte 2.7.84) : pré-remplie au choix du médicament,
                    elle est enregistrée sur la fiche créée pour une NOUVELLE
                    présentation. 2.7.97 — elle n'est PLUS VERROUILLÉE quand la
                    fiche existe : pré-remplie automatiquement, elle reste
                    modifiable et le serveur répercute le choix sur la fiche. */}
                <Field label="Catégorie"
                  hint={fiche
                    ? 'Pré-remplie depuis la fiche — modifiable : la fiche sera mise à jour avec ce choix.'
                    : (ligne.presentation.trim()
                      ? 'Sera enregistrée sur la fiche créée à la validation.'
                      : undefined)}>
                  <Select value={ligne.categoryId} onChange={e => maj(index, { categoryId: e.target.value })}
                    disabled={correctionMode}
                    title={fiche
                      ? 'Catégorie pré-remplie depuis la fiche — vous pouvez la changer : la fiche sera mise à jour'
                      : 'Catégorie de la nouvelle présentation (facultatif)'}>
                    <option value="">— sans catégorie —</option>
                    {categories.filter(c => c.active !== false)
                      .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                {/* 2.7.78 — les consignes sous les champs sont retirées.
                    2.7.97 — l'unité de gestion n'est PLUS VERROUILLÉE (demande
                    de l'officine) : pré-remplie automatiquement depuis la
                    fiche (choisie une fois à la création d'une NOUVELLE
                    présentation), elle reste modifiable à chaque réception —
                    le serveur la répercute sur la fiche, sous réserve qu'une
                    chaîne mémorisée la connaisse (sinon refus guidé). */}
                <Field label="Unité de gestion">
                  {/* 2.7.90 — fiche SANS unité encore fixée (jamais
                      réceptionnée) : cette réception la pose sur la fiche. */}
                  <Select value={ligne.unit || 'boîte'} onChange={e => maj(index, { unit: e.target.value })}
                    disabled={correctionMode}
                    title={fiche && String(fiche.unit || '').trim()
                      ? `Pré-remplie depuis la fiche (« ${fiche.unit} ») — vous pouvez la changer : la fiche sera mise à jour`
                      : 'Pas encore fixée : cette réception la pose sur la fiche.'}>
                    {UNITES_GESTION.map(u => <option key={u} value={u}>{cap(u)}</option>)}
                    {ligne.unit && !UNITES_GESTION.includes(ligne.unit) ? <option value={ligne.unit}>{ligne.unit}</option> : null}
                  </Select>
                </Field>
                {/* 2.7.84 — la livraison se compte dans l'UNITÉ D'ACHAT
                    (ex. carton) ; la conversion vers l'unité de gestion est
                    réglée juste en dessous et MÉMORISÉE sur la fiche. */}
                <Field label="Unité d’achat (livraison)">
                  <Select value={ligne.purchaseUnit || ligne.unit} onChange={e => maj(index, { purchaseUnit: e.target.value })}
                    disabled={correctionMode}
                    title="Unité dans laquelle le fournisseur vous vend (le prix et la quantité saisis sont dans cette unité)">
                    {UNITES_GESTION.map(u => <option key={u} value={u}>{cap(u)}</option>)}
                  </Select>
                </Field>
                <Field label="Quantité reçue">
                  <Input type="number" min="1" step="1" value={ligne.quantity}
                    onChange={e => maj(index, { quantity: e.target.value })} required />
                </Field>
                <Field label={ligne.purchaseUnit && ligne.purchaseUnit !== ligne.unit
                  ? `Prix d’achat par ${ligne.purchaseUnit}`
                  : 'Prix d’achat unitaire'}>
                  <Input type="number" min="0" step="0.01" value={ligne.purchasePrice} onChange={e => maj(index, { purchasePrice: e.target.value })} required />
                </Field>
                <Field label="Numéro de lot">
                  <Input value={ligne.number} onChange={e => maj(index, { number: e.target.value })} required />
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

              {/* ── 2.7.84 — CHAÎNE DE CONDITIONNEMENT : « 1 carton = 100
                  boîtes », « 1 boîte = 10 plaquettes », « 1 flacon = 250 ml »…
                  Saisie libre MAIS mémorisée sur la fiche (re-proposée ensuite).
                  Indispensable dès que l'unité d'achat ≠ l'unité de gestion,
                  ou pour activer la vente au détail (plaquette, comprimé, ml). */}
              <div style={{ marginTop: 8, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div className="row row--tight" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <PackageOpen size={15} className="muted" aria-hidden="true" />
                  <strong style={{ fontSize: '.85rem' }}>Conditionnement</strong>
                  <span className="muted" style={{ fontSize: '.8rem' }}>
                    (contenu de chaque emballage — mémorisé sur la fiche)
                  </span>
                  <div className="spacer" />
                  <Btn variant="ghost" size="sm" icon={Plus} type="button" onClick={() => ajouterMaillon(index)}>
                    Ajouter un niveau
                  </Btn>
                </div>
                {ligne.conversions.length === 0 ? (
                  <p className="muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>
                    Aucune conversion réglée : la quantité reçue est comptée directement en {ligne.unit || 'boîte'}(s).
                  </p>
                ) : ligne.conversions.map((m, rang) => (
                  <div className="row row--tight" key={rang} style={{ alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <span className="muted" style={{ fontSize: '.85rem' }}>1</span>
                    <Select value={m.from} onChange={e => majMaillon(index, rang, { from: e.target.value })}
                      aria-label="Emballage" style={{ width: 110 }}>
                      {UNITES_GESTION.map(u => <option key={u} value={u}>{cap(u)}</option>)}
                      {[m.from, m.to].filter(u => !UNITES_GESTION.includes(u))
                        .map(u => <option key={u} value={u}>{u}</option>)}
                    </Select>
                    <span className="muted" style={{ fontSize: '.85rem' }}>=</span>
                    <Input type="number" min="1" step="1" value={m.count}
                      onChange={e => majMaillon(index, rang, { count: e.target.value })}
                      aria-label="Contenu" style={{ width: 80 }} required />
                    <Select value={m.to} onChange={e => majMaillon(index, rang, { to: e.target.value })}
                      aria-label="Contenu en" style={{ width: 110 }}>
                      {UNITES_GESTION.map(u => <option key={u} value={u}>{cap(u)}</option>)}
                      {[m.from, m.to].filter(u => !UNITES_GESTION.includes(u))
                        .map(u => <option key={u} value={u}>{u}</option>)}
                    </Select>
                    <Btn variant="ghost" size="sm" icon={Trash2} type="button" aria-label="Retirer ce niveau"
                      onClick={() => retirerMaillon(index, rang)} />
                  </div>
                ))}
                {/* Aperçu VIVANT de la conversion achat → gestion. */}
                {ligne.purchaseUnit && ligne.purchaseUnit !== ligne.unit ? (
                  <p style={{ fontSize: '.85rem', margin: '8px 0 0' }}>
                    {facteur == null ? (
                      <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                        Conversion manquante : combien de « {ligne.unit} » contient 1 « {ligne.purchaseUnit} » ?
                        Ajoutez le niveau correspondant ci-dessus.
                      </span>
                    ) : (
                      <span style={{ color: '#15803d', fontWeight: 600 }}>
                        = {quantiteGestion} {ligne.unit}(s) entreront en stock
                        {prixGestion != null ? ` (soit ${prixGestion.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Ar par ${ligne.unit} avant frais)` : ''}.
                      </span>
                    )}
                  </p>
                ) : null}
              </div>

              <div className="row" style={{ flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8 }}>
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
          );
        })}
      </div>

      {/* 2.7.78 — la ligne récapitulative est retirée : le serveur fait
          toujours le calcul (frais automatiques, CMP, prix de vente). */}
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
          disabled={busy || sansExpiration > 0 || conversionManquante > 0 || (correction && motif.trim().length < 3)}>
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