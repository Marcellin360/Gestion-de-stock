// Écran de vente (comptoir) : rechercher, composer le panier, contrôler le
// total proposé par le serveur, encaisser, imprimer le ticket.
// Aucun prix n'est calculé ici : le serveur propose, l'écran affiche (RG04, RG08).
//
// Version 2.7.3 — mise en page et fiabilité :
//   1. L'ancien bloc « Encaissement » placé à droite a disparu ; le bouton
//      « Valider la vente » vit dans le panier (2.7.52 : mise en page modèle
//      MARC en deux colonnes — recherche/client à gauche, panier à droite).
//   2. Le total est recalculé TOUT SEUL (350 ms après un changement du panier) :
//      les prix unitaires apparaissent sans cliquer sur « Recalculer le total ».
//   3. Le message rouge est effacé dès que le panier change : plus de refus
//      « périmé » affiché alors que la quantité a déjà été corrigée.
//   4. La quantité ne peut pas dépasser le stock vendable du comptoir : le « + »
//      se bloque à la limite et un message clair explique combien d'unités
//      restent (les lots expirés, bloqués ou restés au dépôt ne comptent pas).
//
// Version 2.7.13 — LISTE DÉROULANTE au comptoir :
//   Le champ « 1 · Rechercher un médicament » affiche TOUS les médicaments
//   vendables (stock du comptoir > 0) dans une liste qui défile (scroll), et la
//   recherche filtre dès 1 caractère. Les ruptures (lot bloqué, expiré ou resté
//   au dépôt) ne sont plus proposées : impossible de cliquer sur un produit
//   impossible à vendre.
//
// Version 2.7.12 — VENTE AU DÉTAIL (3 unités par ligne) :
//   Chaque ligne du panier propose Boîte / Plaquette / Comprimé.
//   « Matetika » : boîte 1 = plaquettes 10, plaquette 1 = comprimé 10 — mais ces
//   nombres se règlent par médicament dans la fiche (Catalogue → Modifier).
//   Les 3 PRIX sont indépendants (« tsy hitovy ») : prix plaquette / comprimé
//   réglés dans la fiche ; à 0, le serveur calcule au prorata du prix boîte.
//   Le « + » plafonne au stock vendable EXPRIMÉ dans l'unité choisie.
//
// Contrat d'appel (ne pas renommer les champs !) :
//   POST /api/sales/quote  { note, lines: [{ productId, quantity, saleUnit }] }
//   POST /api/sales        { requestKey, expectedTotal, customerName, note, lines: idem }
//
// Version 2.7.52 — INTERFACE « modèle MARC » (visuel uniquement, logique inchangée) :
//   La page passe en DEUX COLONNES comme la maquette : à gauche les cartes
//   « 1 · Rechercher » et « 3 · Client, remarque et validation », à droite la
//   carte « 2 · Panier » (lignes avec vignette, sélecteur d'unité en chips,
//   quantité en stepper, totaux, grand bouton vert « Valider la vente »).
//   Toute la logique (recalcul auto du devis, plafonds de stock FEFO, carnet
//   hôpital, validations, impression) est STRICTEMENT inchangée ; seuls le JSX
//   ci-dessous et les styles .vt-* (styles.css) sont neufs.
//
// Version 2.7.55 — ÉCRAN ALLÉGÉ (visuel uniquement, logique inchangée) :
//   Supprimés : la rangée de boutons « clients déjà servis » sous le champ
//   « Client (facultatif) » (la liste déroulante NATIVE du champ suffit) et
//   cinq textes d'aide redondants : l'indication sous la recherche, la note
//   FEFO à côté de « Recalculer le total », l'indication du champ client, le
//   bandeau « total calculé par le serveur » du pied du panier et la note
//   « une vente ne se supprime jamais » sous le bouton Valider.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Trash2, Printer, Check, RefreshCw, Plus, Minus, ShoppingCart, Hospital, Pill, Droplets, ChevronRight, FileDown } from 'lucide-react';
import { stock, hopital } from '../api/endpoints.js';
import { newRequestKey, openPrintable, downloadPdf } from '../api/client.js';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Banner, Btn, Card, Empty, ErrorBox, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { money, integer, today } from '../utils/format.js';

// Unités vendues au comptoir (contrat backend : BOX / BLISTER / UNIT).
const UNITES = [
  { code: 'BOX', label: 'Boîte', pluriel: 'boîtes' },
  { code: 'BLISTER', label: 'Plaquette', pluriel: 'plaquettes' },
  { code: 'UNIT', label: 'Comprimé', pluriel: 'comprimés' }
];
const UNITE_LABEL = code => UNITES.find(u => u.code === code)?.label || 'Boîte';
const UNITE_PLURIEL = code => UNITES.find(u => u.code === code)?.pluriel || 'boîtes';

/** Nombre d'unités choisies dans 1 boîte (unité de gestion) pour ce médicament. */
const facteurUnite = (product, saleUnit) => {
  if (!product) return 1;
  const plaquettes = Number(product.blistersPerBox || 0);
  const comprimes = Number(product.unitsPerBlister || 0);
  if (saleUnit === 'BLISTER') return plaquettes;
  if (saleUnit === 'UNIT') return plaquettes * comprimes;
  return 1;
};

/** Icône décorative du produit (modèle MARC) : simple repère visuel par forme. */
const iconeProduit = produit => {
  const texte = `${produit?.form || ''} ${produit?.name || ''} ${produit?.presentation || ''}`.toLowerCase();
  if (/sirop|solution|suspension|s\u00e9rum|serum|goutte|inject|perfusion|collyre/.test(texte)) return Droplets;
  return Pill;
};

/** Deux lignes du panier sont identiques si médicament + unité sont identiques. */
const memeLigne = (a, productId, saleUnit) => a.productId === productId && a.saleUnit === saleUnit;

export default function SalesPage() {
  const { products, sellableStock, refresh, settings, productName, product, documents } = useData();
  const { can, user } = useAuth();
  const toast = useToast();

  // 2.7.58 — tout téléchargement de PDF remonte son erreur dans une toast
  // (ex. backend pas encore redémarré → message explicite au comptoir).
  // 2.7.63 — si la protection web locale a vidé la réponse du fetch, le
  // navigateur contourne le blocage : on le dit clairement (succès, pas erreur).
  const telechargerPdf = (chemin, nomFichier) => downloadPdf(chemin, nomFichier)
    .then(result => {
      if (result?.via === 'navigateur') {
        // 2.7.64 — toast = objet { success, warn, error }, pas une fonction :
        // c'est .warn (avertissement) qui convient à ce message neutre.
        toast.warn('Téléchargement lancé par le NAVIGATEUR (la protection web locale bloquait le fetch) : '
          + 'vérifiez votre dossier « Téléchargements ». Si le fichier n’y figure pas, '
          + 'ajoutez ce site aux exclusions de l’antivirus.');
      }
    })
    .catch(cause => toast.error(cause.message || 'Téléchargement du PDF impossible.'));

  const searchRef = useRef(null);
  const [term, setTerm] = useState('');
  const [panier, setPanier] = useState([]);
  const [client, setClient] = useState('');
  // 2.7.35 — hôpital : deux modes au comptoir.
  //   false = « client tsotra » (vente de passage, ticket de vente classique) ;
  //   true  = « carnet hôpital » : le médecin/sage-femme arrive avec le carnet
  //   d'un patient hospitalisé ; la vente lie patient + prescripteur et
  //   l'impression devient une ORDONNANCE (sans aucun montant).
  const [venteCarnet, setVenteCarnet] = useState(false);
  const [patients, setPatients] = useState([]);
  const [prescripteurs, setPrescripteurs] = useState([]);
  const [patientSel, setPatientSel] = useState(''); // id du patient ('' = aucun)
  const [staffSel, setStaffSel] = useState(''); // id du prescripteur ('' = aucun)
  const [note, setNote] = useState('');
  // 2.7.79 — « Servi par » SAISI (demande de l'officine : la personne qui sert
  // change d'une vente à l'autre). PRÉ-REMPLI avec le compte connecté et
  // modifiable ; le nom choisi voyage avec la vente jusqu'au ticket/ordonnance.
  const [serviPar, setServiPar] = useState(user?.name || '');
  const [devis, setDevis] = useState(null);
  const [error, setError] = useState(null);
  const [avertissement, setAvertissement] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cloture, setCloture] = useState(null);
  const [cle, setCle] = useState(() => newRequestKey());

  // 2.7.35 — référentiels du carnet (patients en service + prescripteurs
  // actifs), chargés une fois au montage ; un refus (ex. menu pas encore
  // migré côté base) reste silencieux : la vente tsotra reste possible.
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const [listePatients, listeStaff] = await Promise.all([hopital.patients(), hopital.staff()]);
        if (annule) return;
        setPatients(listePatients.filter(p => p.active));
        setPrescripteurs(listeStaff.filter(m => m.active));
      } catch { /* silencieux : le menu « Hôpital (carnets) » affichera l'erreur */ }
    })();
    return () => { annule = true; };
  }, []);

  // Résumé du jour affiché à côté du bouton d'historique.
  const ventesDuJour = useMemo(() => (documents || []).filter(doc =>
    doc.kind === 'SALE' && doc.status === 'VALIDATED' && String(doc.date).slice(0, 10) === today()
  ), [documents]);
  const encaisseJour = ventesDuJour.reduce((total, doc) => total + Number(doc.total || 0), 0);

  // 2.7.13 — liste déroulante des médicaments VENDABLES (stock comptoir > 0),
  // filtrable dès 1 caractère. Sans saisie : la liste complète défile (la zone
  // est scrollable) ; dès le 1er caractère tapé, on filtre sur nom, code,
  // principe actif ou code-barres.
  const resultats = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const vendables = products
      .filter(produit => produit.active && Number(sellableStock(produit.id) || 0) > 0);
    const trouves = needle.length < 1 ? vendables : vendables
      .filter(produit => [produit.name, produit.code, produit.ingredient, produit.barcode]
        .some(field => String(field || '').toLowerCase().includes(needle)));
    return trouves
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'))
      .slice(0, 50);
  }, [term, products, sellableStock]);

  // Clients déjà servis : proposés en liste pour éviter la saisie répétée.
  const clientsConnus = useMemo(() => {
    const noms = new Set();
    for (const document of documents || []) {
      const nom = String(document.customerName || '').trim();
      if (nom) noms.add(nom);
    }
    return [...noms].sort((a, b) => a.localeCompare(b)).slice(0, 50);
  }, [documents]);

  // ---------------------------------------------------------------------------
  // Panier prêt pour le serveur : champs strictement conformes à l'API,
  // avec l'unité de vente choisie (saleUnit, 2.7.12) et la quantité tapée
  // dans cette unité (le serveur convertit en boîtes pour le stock).
  // ---------------------------------------------------------------------------
  const lignesEnvoyees = liste => liste.map(ligne => ({
    productId: Number(ligne.productId),
    quantity: Number(ligne.quantity),
    saleUnit: ligne.saleUnit || 'BOX'
  }));

  const unites = panier.reduce((total, ligne) => total + Number(ligne.quantity || 0), 0);
  // Stock vendable du comptoir en boîtes (équivalent gestion) — base du calcul.
  const stockBoites = productId => Number(sellableStock(productId) || 0);
  // Maximum vendable EXPRIMÉ dans l'unité choisie (2.7.12) :
  // 8,3 boîtes = 83 plaquettes d'une boîte de 10 ; + epsilon anti-arondi.
  const maximumDe = (productId, saleUnit = 'BOX') => {
    const produit = product(productId);
    const facteur = Math.max(1, facteurUnite(produit, saleUnit));
    return Math.floor(stockBoites(productId) * facteur + 1e-9);
  };

  // ---------------------------------------------------------------------------
  // Recalcul automatique du total : à chaque changement du panier, on interroge
  // le serveur (350 ms de délai) pour afficher les prix. Les refus de ce calcul
  // automatique restent silencieux : le bouton « Recalculer le total » sert
  // justement à voir le détail d'un refus.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setError(null);
    setDevis(null);
    if (panier.length === 0) return undefined;
    let annule = false;
    const minuteur = setTimeout(async () => {
      try {
        const reponse = await stock.quoteSale({ note, lines: lignesEnvoyees(panier) });
        if (!annule) setDevis(reponse);
      } catch {
        if (!annule) setDevis(null);
      }
    }, 350);
    return () => { annule = true; clearTimeout(minuteur); };
  }, [panier, note]);

  // ---------------------------------------------------------------------------
  // Ajout d'une ligne : la quantité est plafonnée au stock vendable du comptoir,
  // exprimé dans l'unité choisie pour cette ligne (2.7.12).
  // ---------------------------------------------------------------------------
  const ajouter = (productId, nombre = 1, saleUnit = 'BOX') => {
    const maximum = maximumDe(productId, saleUnit);
    const actuelle = panier.find(ligne => memeLigne(ligne, productId, saleUnit))?.quantity || 0;
    if (maximum <= 0) {
      setAvertissement(`« ${productName(productId)} » n’a aucun lot vendable au comptoir `
        + '(expiré, bloqué ou encore au dépôt). Transférez-le depuis le dépôt avant de le vendre.');
      return;
    }
    if (actuelle >= maximum) {
      setAvertissement(`« ${productName(productId)} » : le comptoir ne peut pas vendre plus de ${integer(maximum)} `
        + `${UNITE_PLURIEL(saleUnit)}. Transférez d’abord une quantité supplémentaire depuis le dépôt.`);
      return;
    }
    const cible = Math.min(maximum, actuelle + nombre);
    setAvertissement(null);
    setCloture(null);
    setPanier(lignes => {
      const existante = lignes.find(ligne => memeLigne(ligne, productId, saleUnit));
      if (existante) {
        return lignes.map(ligne => (memeLigne(ligne, productId, saleUnit) ? { ...ligne, quantity: cible } : ligne));
      }
      return [...lignes, { productId, saleUnit, quantity: cible }];
    });
  };

  // Changer l'unité d'une ligne du panier : boîte ↔ plaquette ↔ comprimé.
  // La quantité tapée est simplement re-plafonnée au maximum de la nouvelle unité.
  const changerUnite = (ligneCible, nouvelleUnite) => {
    const produit = product(ligneCible.productId);
    const facteur = facteurUnite(produit, nouvelleUnite);
    if (facteur < 1) {
      setAvertissement(`« ${productName(ligneCible.productId)} » n’a pas de conditionnement par `
        + `${UNITE_LABEL(nouvelleUnite).toLowerCase()} (fiche médicament → Modifier).`);
      return;
    }
    setAvertissement(null);
    setCloture(null);
    setPanier(lignes => lignes.map(ligne => (memeLigne(ligne, ligneCible.productId, ligneCible.saleUnit)
      ? { ...ligne, saleUnit: nouvelleUnite, quantity: Math.max(1, Math.min(ligne.quantity, maximumDe(ligne.productId, nouvelleUnite) || 1)) }
      : ligne)));
  };

  // Ajustement avec le « + » / « − » du panier (même plafond, dans l'unité choisie).
  const modifier = (ligneCible, delta) => {
    const maximum = maximumDe(ligneCible.productId, ligneCible.saleUnit);
    if (delta > 0) {
      const actuelle = panier.find(ligne => memeLigne(ligne, ligneCible.productId, ligneCible.saleUnit))?.quantity || 0;
      if (actuelle >= maximum) {
        setAvertissement(`« ${productName(ligneCible.productId)} » : maximum vendable au comptoir = `
          + `${integer(maximum)} ${UNITE_PLURIEL(ligneCible.saleUnit)}. `
          + 'Pour en vendre davantage, faites d’abord un transfert depuis le dépôt.');
        return;
      }
    }
    setAvertissement(null);
    setPanier(lignes => lignes
      .map(ligne => (memeLigne(ligne, ligneCible.productId, ligneCible.saleUnit)
        ? { ...ligne, quantity: ligne.quantity + delta } : ligne))
      .filter(ligne => ligne.quantity > 0));
  };

  // 2.7.31 — saisie DIRECTE de la quantité (clavier), en plus des boutons
  // « + » / « − » : indispensable quand la quantité est grande.
  const fixer = (ligneCible, saisie) => {
    const maximum = maximumDe(ligneCible.productId, ligneCible.saleUnit);
    const demande = Number(saisie);
    if (!Number.isFinite(demande) || demande <= 0) return;  // saisie vide : on attend la suite
    if (demande > maximum) {
      setAvertissement(`« ${productName(ligneCible.productId)} » : maximum vendable au comptoir = `
        + `${integer(maximum)} ${UNITE_PLURIEL(ligneCible.saleUnit)}. `
        + 'Pour en vendre davantage, faites d’abord un transfert depuis le dépôt.');
      return;
    }
    setAvertissement(null);
    setPanier(lignes => lignes.map(ligne => (memeLigne(ligne, ligneCible.productId, ligneCible.saleUnit)
      ? { ...ligne, quantity: Math.min(demande, maximum) } : ligne)));
  };

  const retirer = ligneCible => {
    setAvertissement(null);
    setPanier(lignes => lignes.filter(ligne => !memeLigne(ligne, ligneCible.productId, ligneCible.saleUnit)));
  };

  const viderPanier = () => {
    setAvertissement(null);
    setPanier([]);
    setDevis(null);
    setError(null);
  };

  const chargerDevis = async () => {
    setBusy(true);
    setError(null);
    try {
      const reponse = await stock.quoteSale({ note, lines: lignesEnvoyees(panier) });
      setDevis(reponse);
      return reponse;
    } catch (cause) {
      setError(cause);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const valider = async () => {
    setBusy(true);
    setError(null);
    try {
      const reponse = await stock.createSale({
        requestKey: cle,
        expectedTotal: devis?.total,
        customerName: client,
        // 2.7.35 — mode carnet : le patient et le prescripteur partent avec
        // la vente ; en mode tsotra, les deux champs restent null et le
        // serveur enregistre une vente de comptoir comme avant.
        patientId: venteCarnet && patientSel ? Number(patientSel) : null,
        medicalStaffId: venteCarnet && staffSel ? Number(staffSel) : null,
        note,
        // 2.7.79 — le nom « Servi par » tapé à la caisse (utilisateur par défaut).
        servedBy: serviPar.trim(),
        lines: lignesEnvoyees(panier)
      });
      toast.success(`Vente enregistrée : ${reponse.reference}`);
      setCloture(reponse);
      setPanier([]);
      setClient('');
      setPatientSel('');
      setStaffSel('');
      setNote('');
      setServiPar(user?.name || '');
      setDevis(null);
      setAvertissement(null);
      setCle(newRequestKey());
      setTerm('');
      await refresh();
      searchRef.current?.focus();
    } catch (cause) {
      if (cause.status === 409) {
        setError({ message: 'Les prix ou le stock ont changé depuis le calcul : vérifiez le nouveau total puis validez à nouveau.' });
        await chargerDevis();
      } else {
        setError(cause);
      }
    } finally {
      setBusy(false);
    }
  };

  const surEntree = event => {
    if (event.key === 'Enter' && resultats.length) {
      event.preventDefault();
      ajouter(resultats[0].id);
      setTerm('');
    }
  };

  return (
    <div className="stack vt-page">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Badge tone="info">
          Aujourd’hui : {ventesDuJour.length} vente(s) validée(s){ventesDuJour.length ? ` — ${money(encaisseJour)}` : ''}
        </Badge>
        {/* 2.7.37 — teboka ④ : le bouton « Historique de vente » est retiré de
            cette page : l'historique a désormais SON MENU sous « Vente ». */}
      </div>

      {/* 2.7.52/2.7.54 — deux colonnes (modèle MARC) :
          à GAUCHE les cartes 1 (recherche) et 3 (client/remarque),
          à DROITE la carte 2 (PANIER) — la colonne de droite est volontairement
          PLUS LARGE que la gauche (2.7.54, voir .vt-grid dans styles.css). */}
      <div className="vt-grid">
        <div className="stack">

          {/* ------------------------------------------------------ 1 */}
          <Card title="1 · Rechercher un médicament au comptoir"
            actions={
              /* Badge d'information (réglage serveur) habillé en commutateur,
                 comme sur la maquette ; il n'active rien (affichage seul). */
              <span className="vt-switch"
                title={settings.marginMode === 'SALE' ? 'Marge calculée sur le prix de vente (Paramètres)' : 'Marge calculée sur le coût (Paramètres)'}>
                <span className="vt-switch__track" aria-hidden="true"><span className="vt-switch__thumb" /></span>
                {settings.marginMode === 'SALE' ? 'marge sur prix de vente' : 'marge sur coût'}
              </span>}>
            <div className="vt-search">
              <Search size={17} className="vt-search__ico" aria-hidden="true" />
              <Input ref={searchRef} value={term} onChange={e => setTerm(e.target.value)} onKeyDown={surEntree}
                placeholder="Ex. : amoxicilline, PARA-500…" autoFocus />
            </div>
            {/* Liste déroulante : TOUS les médicaments vendables au comptoir,
                filtrée dès le 1er caractère ; cliquez pour ajouter au panier. */}
            {resultats.length ? (
              <div className="suggestions vt-suggestions">
                {resultats.map(produit => {
                  const dispo = stockBoites(produit.id);
                  const Icone = iconeProduit(produit);
                  return (
                    <button key={produit.id} onClick={() => { ajouter(produit.id); setTerm(''); }}
                      title={`Ajouter au panier (un clic) — ${produit.name} · ${integer(dispo)} boîte(s) en stock vendable au comptoir, sortie en FEFO (le lot qui périme le plus tôt part le premier)`}>
                      <span className="vt-prod-ico" aria-hidden="true"><Icone size={16} /></span>
                      <span className="vt-prod-info">
                        <span className="row row--tight">
                          <strong>{produit.name}</strong>
                          <small>{produit.code}</small>
                          <div className="spacer" />
                          <Badge tone="ok">{integer(dispo)} en stock vendable</Badge>
                        </span>
                        <small>{produit.presentation || produit.dosage || produit.form || ''} {produit.unit ? `· ${produit.unit}` : ''}</small>
                      </span>
                      <ChevronRight size={16} className="vt-prod-chev" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <Banner tone="info" title="Aucun médicament vendable au comptoir">
                {term.trim()
                  ? `Aucun médicament vendable ne correspond à « ${term.trim()} » — essayez un autre mot.`
                  : 'Aucun lot vendable : les marchandises restées au dépôt doivent d’abord être transférées (écran « Historique de transfert » → « Nouveau transfert »).'}
              </Banner>
            )}
            {/* 2.7.55 — la note FEFO affichée ici a été retirée (redondante) ; */}
            <div className="row" style={{ marginTop: 14, alignItems: 'center' }}>
              <Btn variant="ghost" icon={RefreshCw} onClick={chargerDevis} disabled={!panier.length || busy}>Recalculer le total</Btn>
            </div>
          </Card>


          {/* ------------------------------------------------------ 2 · Panier (à gauche, sous la recherche) */}
          <Card title="3 · Client, remarque et validation"
            actions={<Badge tone={panier.length ? 'info' : 'default'}>
              {panier.length ? `${integer(unites)} article(s)` : 'panier vide'}
            </Badge>}>
            {/* 2.7.35 — choix du TYPE de vente :
                • « Client tsotra » : vente de passage → ticket de caisse (inchangé) ;
                • « Carnet hôpital » : le facteur arrive avec le carnet d'un médecin
                  ou d'une sage-femme → patient + prescripteur enregistrés, la
                  sortie de stock est la même (FEFO comptoir, RG05) mais le papier
                  remis est une ORDONNANCE sans aucun montant. */}
            <div className="vt-modes">
              <button type="button" className={`vt-mode ${!venteCarnet ? 'vt-mode--on' : ''}`}
                onClick={() => setVenteCarnet(false)}>
                Client tsotra (vente de passage)
              </button>
              <button type="button" className={`vt-mode ${venteCarnet ? 'vt-mode--on' : ''}`}
                onClick={() => setVenteCarnet(true)}>
                <Hospital size={15} aria-hidden="true" /> Carnet hôpital (patient hospitalisé)
              </button>
            </div>

            <div className="grid grid--2">
              {venteCarnet ? (
                <>
                  <Field label="Patient hospitalisé"
                    hint="Liste du menu « Hôpital (carnets) » — patients en service ; on y crée aussi un nouveau patient.">
                    <Select value={patientSel} onChange={e => setPatientSel(e.target.value)}>
                      <option value="">— choisir le patient du carnet —</option>
                      {patients.map(patient => (
                        <option key={patient.id} value={patient.id}>
                          {patient.name}{patient.service ? ` · ${patient.service}` : ''}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Prescrit par (médecin / sage-femme)"
                    hint="Personnel soignant actif ; jour de garde réglé dans « Hôpital (carnets) ».">
                    <Select value={staffSel} onChange={e => setStaffSel(e.target.value)}>
                      <option value="">— choisir le prescripteur —</option>
                      {prescripteurs.map(membre => (
                        <option key={membre.id} value={membre.id}>
                          {membre.name} ({membre.role === 'MIDWIFE' ? 'sage-femme' : 'médecin'})
                        </option>
                      ))}
                    </Select>
                  </Field>
                </>
              ) : (
                <Field label="Client (facultatif)">
                  <Input list="clients-connus" value={client} onChange={e => setClient(e.target.value)} placeholder="Client de passage" />
                  <datalist id="clients-connus">
                    {clientsConnus.map(nom => <option key={nom} value={nom} />)}
                  </datalist>
                </Field>
              )}
              {/* 2.7.79 — « Servi par » SAISI : la personne responsable au
                  comptoir change d'une vente à l'autre, le nom tapé suit la
                  vente (ticket, ordonnance et historiques). */}
              <Field label="Servi par"
                hint="Pré-rempli avec votre nom ; modifiez-le si une autre personne sert au comptoir.">
                <Input value={serviPar} onChange={e => setServiPar(e.target.value)} maxLength={120} />
              </Field>
              <Field label="Remarque (facultative)">
                <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Ordonnance, précision de vente…" />
              </Field>
            </div>
            {venteCarnet ? (
              <div style={{ marginTop: 6 }}>
                <Banner tone="info">
                  {`Le papier remis au facteur sera l'ORDONNANCE (patient, prescripteur, médicaments — sans montant)${patientSel ? '' : ' ; le patient reste à choisir pour le nommer sur le document'}.`}
                </Banner>
              </div>
            ) : null}
          </Card>
        </div>

        <Card title={`2 · Panier${panier.length ? ` — ${integer(unites)} article(s)` : ''}`} flush
          actions={panier.length ? <Btn variant="ghost" icon={Trash2} onClick={viderPanier}>Vider le panier</Btn> : null}>
          {avertissement ? (
            <div style={{ padding: '0 16px 12px' }}>
              <Banner tone="warn" title="Quantité limitée au stock du comptoir">{avertissement}</Banner>
            </div>
          ) : null}
          {panier.length === 0 ? <Empty>Panier vide : recherchez un médicament pour commencer.</Empty> : (
            <div className="vt-lines">
              <div className="vt-line vt-line--head" aria-hidden="true">
                <span>Produit</span>
                <span className="vt-line__head-qty">Quantité</span>
                <span className="num">Prix unité</span>
                <span className="num">Total</span>
                <span />
              </div>
              {panier.map(ligne => {
                const produit = product(ligne.productId);
                const maximum = maximumDe(ligne.productId, ligne.saleUnit);
                const trouve = devis?.lines?.filter(item => item.productId === ligne.productId) || [];
                const prix = trouve[0]?.unitPrice;
                const facteur = facteurUnite(produit, ligne.saleUnit);
                const Icone = iconeProduit(produit);
                return (
                  <div key={`${ligne.productId}-${ligne.saleUnit}`} className="vt-line">
                    <div className="vt-line__prod">
                      <span className="vt-prod-ico" aria-hidden="true"><Icone size={16} /></span>
                      <div className="vt-line__desc">
                        <strong className="vt-line__name">{productName(ligne.productId)}</strong>
                        {/* 2.7.12 — choix Boîte / Plaquette / Comprimé par ligne.
                            Une sous-unité sans conditionnement (0 dans la fiche)
                            est proposée mais grisée avec une explication. */}
                        <div className="vt-unites" role="group" aria-label="Unité vendue">
                          {UNITES.map(unite => {
                            const facteurPossible = facteurUnite(produit, unite.code);
                            const desactive = unite.code !== 'BOX' && facteurPossible < 1;
                            return (
                              <Btn key={unite.code} size="sm"
                                variant={ligne.saleUnit === unite.code ? 'primary' : 'ghost'}
                                disabled={desactive}
                                title={desactive
                                  ? 'Conditionnement non renseigné dans la fiche médicament'
                                  : `${UNITE_LABEL(unite.code)}${facteur > 1 && ligne.saleUnit === unite.code ? ` · ${facteur}/boîte` : ''}`}
                                onClick={() => changerUnite(ligne, unite.code)}>
                                {unite.label}
                              </Btn>
                            );
                          })}
                        </div>
                        <small className="muted vt-line__max">maximum vendable : {integer(maximum)} {UNITE_PLURIEL(ligne.saleUnit)}</small>
                      </div>
                    </div>
                    <div className="counter vt-stepper">
                      <button onClick={() => modifier(ligne, -1)} aria-label="Diminuer" title={`Retirer une ${UNITE_LABEL(ligne.saleUnit).toLowerCase()}`}><Minus size={14} /></button>
                      {/* 2.7.31 — quantité saisissable au clavier (les boutons
                          « + » et « − » restent pour les petits ajustements). */}
                      <input type="number" min="1" step="1" max={maximum}
                        value={ligne.quantity}
                        onChange={e => fixer(ligne, e.target.value)}
                        title={`Quantité (saisie directe) — maximum vendable : ${maximum} ${UNITE_PLURIEL(ligne.saleUnit)}`}
                        style={{ minWidth: 34, width: 64, textAlign: 'center', fontWeight: 700 }}
                        aria-label="Quantité (saisie directe)" />
                      <button onClick={() => modifier(ligne, 1)} aria-label="Augmenter"
                        disabled={ligne.quantity >= maximum}
                        title={ligne.quantity >= maximum
                          ? `Maximum vendable au comptoir : ${maximum} ${UNITE_PLURIEL(ligne.saleUnit)}`
                          : `Ajouter une ${UNITE_LABEL(ligne.saleUnit).toLowerCase()}`}>
                        <Plus size={14} />
                      </button>
                    </div>
                    <span className="num vt-line__pu">{prix ? money(prix) : '—'}</span>
                    <span className="num vt-line__tot">{prix ? money(Number(prix) * ligne.quantity) : '—'}</span>
                    <button type="button" className="vt-line__del" onClick={() => retirer(ligne)}
                      aria-label="Retirer" title="Retirer cette ligne du panier">
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="vt-pied">
            {devis ? (
              <>
                {/* Détail FEFO (expirations) : replié pour garder la page claire
                    comme la maquette ; l'information reste consultable. */}
                <details className="vt-fefo">
                  <summary>Détail des lots retenus (FEFO, expirations)</summary>
                  <div className="table-scroll" style={{ marginTop: 6 }}>
                    <table className="data">
                      {/* 2.7.37 — teboka ④ : la colonne « Lot retenu (FEFO) » n'est
                        plus affichée (le serveur le choisit ; l'écran reste simple). */}
                      <thead><tr><th>Médicament</th><th>Expiration</th><th className="num">Qté</th><th className="num">PU</th></tr></thead>
                      <tbody>
                        {devis.lines.map((ligne, index) => (
                          <tr key={index}>
                            <td className="wrap">
                              {ligne.product || '—'}
                              {ligne.saleUnit && ligne.saleUnit !== 'BOX'
                                ? <Badge tone="info" style={{ marginLeft: 6 }}>{UNITE_LABEL(ligne.saleUnit)}</Badge> : null}
                            </td>
                            <td>{ligne.expiresOn ? new Date(ligne.expiresOn).toLocaleDateString('fr-FR') : 'non daté'}</td>
                            <td className="num">{integer(Number(ligne.saleQuantity ?? ligne.quantity))}</td>
                            <td className="num">{money(ligne.unitPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                <div className="vt-totals">
                  <div className="total-line">
                    <span>Sous-total ({integer(devis.lines.reduce((total, ligne) => total + Number(ligne.saleQuantity ?? ligne.quantity), 0))} article(s))</span>
                    <span>{money(devis.total)}</span>
                  </div>
                  {can('prices') ? <div className="total-line muted"><span>Coût retenu</span><span>{money(devis.costTotal)}</span></div> : null}
                  {can('prices') ? <div className="total-line muted"><span>Marge brute</span><span>{money(devis.margin)}</span></div> : null}
                  <div className="total-line total-line--grand">
                    <span>Total à payer</span>
                    <strong>{money(devis.total)}</strong>
                  </div>
                </div>
                <Banner tone="info">
                  Le total est calculé en temps réel par le serveur à partir du stock réel :
                  il se met à jour dès que vous ajoutez ou ajustez un médicament au panier.
                </Banner>
              </>
            ) : null}
            {/* 2.7.55 — le bandeau d'aide « total calculé par le serveur » a
                été retiré : le total apparaît de lui-même ~350 ms après un
                changement du panier. */}

            {error ? <div style={{ marginTop: 12 }}><ErrorBox error={error} /></div> : null}

            <div style={{ marginTop: 14 }}>
              <button type="button" className="vt-valider" disabled={!panier.length || busy} onClick={valider}>
                <Check size={19} aria-hidden="true" />
                {busy ? 'Enregistrement…' : `Valider la vente${devis ? ` — ${money(devis.total)}` : ''}`}
              </button>
            </div>

            {cloture ? (
              <Banner tone="ok" title={`Vente ${cloture.reference} enregistrée — ${money(cloture.total)}`}>
                <div className="row row--tight" style={{ marginTop: 8 }}>
                  {/* 2.7.57 — UN SEUL document par vente, TÉLÉCHARGÉ en PDF
                      dans les deux cas (les deux boutons font la même chose) :
                      • vente CLIENT TSOTRA   → le TICKET seul est proposé ;
                      • vente CARNET HÔPITAL  → l'ORDONNANCE seule est proposée
                        (le ticket de caisse n'apparaît pas pour un hospitalisé). */}
                  {cloture.patientId || cloture.medicalStaffId ? (
                    <>
                      <Btn variant="primary" icon={Hospital}
                        onClick={() => telechargerPdf(cloture.patientId
                          ? `/patients/${cloture.patientId}/ordonnance?fmt=pdf`
                          : `/sales/${cloture.id}/ordonnance?fmt=pdf`, `ordonnance-${cloture.reference}.pdf`)}>
                        Imprimer l’ordonnance
                      </Btn>
                      <Btn variant="ghost" icon={FileDown}
                        onClick={() => telechargerPdf(cloture.patientId
                          ? `/patients/${cloture.patientId}/ordonnance?fmt=pdf`
                          : `/sales/${cloture.id}/ordonnance?fmt=pdf`, `ordonnance-${cloture.reference}.pdf`)}>
                        Télécharger le PDF
                      </Btn>
                    </>
                  ) : (
                    <>
                      <Btn icon={Printer}
                        onClick={() => telechargerPdf(`/documents/SALE/${cloture.id}/print?fmt=pdf`, `ticket-${cloture.reference}.pdf`)}>
                        Imprimer le ticket
                      </Btn>
                      <Btn variant="ghost" icon={FileDown}
                        onClick={() => telechargerPdf(`/documents/SALE/${cloture.id}/print?fmt=pdf`, `ticket-${cloture.reference}.pdf`)}>
                        Télécharger le PDF
                      </Btn>
                    </>
                  )}
                  <Btn variant="ghost" icon={ShoppingCart} onClick={() => { setCloture(null); searchRef.current?.focus(); }}>
                    Vente suivante
                  </Btn>
                </div>
              </Banner>
            ) : null}
          </div>
        </Card>
      </div>

    </div>
  );
}