// Écran de vente (comptoir) : rechercher, composer le panier, contrôler le
// total proposé par le serveur, encaisser, imprimer le ticket.
// Aucun prix n'est calculé ici : le serveur propose, l'écran affiche (RG04, RG08).
//
// Version 2.7.3 — mise en page et fiabilité :
//   1. UNE SEULE COLONNE : la recherche, le panier, puis « Client, remarque et
//      validation ». L'ancien bloc « Encaissement » placé à droite a disparu ;
//      le bouton « Valider la vente » est maintenant tout en bas de l'écran,
//      sur toute la largeur (plus simple au comptoir, sur téléphone aussi).
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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Trash2, Printer, Check, RefreshCw, Plus, Minus, ShoppingCart, History } from 'lucide-react';
import { stock } from '../api/endpoints.js';
import { newRequestKey, openPrintable } from '../api/client.js';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Banner, Btn, Card, Empty, ErrorBox, Field, Input, Textarea } from '../components/ui.jsx';
import SaleHistoryModal from '../components/SaleHistoryModal.jsx';
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

/** Deux lignes du panier sont identiques si médicament + unité sont identiques. */
const memeLigne = (a, productId, saleUnit) => a.productId === productId && a.saleUnit === saleUnit;

export default function SalesPage() {
  const { products, sellableStock, refresh, settings, productName, product, documents } = useData();
  const { can } = useAuth();
  const toast = useToast();

  const searchRef = useRef(null);
  const [term, setTerm] = useState('');
  const [panier, setPanier] = useState([]);
  const [client, setClient] = useState('');
  const [note, setNote] = useState('');
  const [devis, setDevis] = useState(null);
  const [error, setError] = useState(null);
  const [avertissement, setAvertissement] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cloture, setCloture] = useState(null);
  const [cle, setCle] = useState(() => newRequestKey());
  // 2.7.11 — bouton « Historique de vente » en haut de l'écran : toutes les ventes
  // avec leurs détails (montant, marge, lignes par lot) et l'annulation motivée.
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);

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
        note,
        lines: lignesEnvoyees(panier)
      });
      toast.success(`Vente enregistrée : ${reponse.reference}`);
      setCloture(reponse);
      setPanier([]);
      setClient('');
      setNote('');
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
    <div className="stack">
      {/* 2.7.11 — « Historique de vente » : toutes les ventes avec leurs détails
          (client, montant, marge, médicament/lot/quantité/prix) ; l'annulation
          motivée des ventes se fait ici depuis que le menu « Documents » a été
          retiré des menus (il reste joignable par #/documents). */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Badge tone="info">
          Aujourd’hui : {ventesDuJour.length} vente(s) validée(s){ventesDuJour.length ? ` — ${money(encaisseJour)}` : ''}
        </Badge>
        <Btn variant="ghost" icon={History} onClick={() => setHistoriqueOuvert(true)}>Historique de vente</Btn>
      </div>

      {/* ---------------------------------------------------------------- 1 */}
      <Card title="1 · Rechercher un médicament au comptoir"
        actions={<Badge tone="info">{settings.marginMode === 'SALE' ? 'marge sur prix de vente' : 'marge sur coût'}</Badge>}>
        <label className="field">
          <span className="field__hint">Nom, code, principe actif ou code-barres — dès 1 caractère ; la liste ci-dessous défile (scroll)</span>
          <Input ref={searchRef} value={term} onChange={e => setTerm(e.target.value)} onKeyDown={surEntree}
            placeholder="Ex. : amoxicilline, PARA-500…" autoFocus />
        </label>
        {/* Liste déroulante : TOUS les médicaments vendables au comptoir,
            filtrée dès le 1er caractère ; cliquez pour ajouter au panier. */}
        {resultats.length ? (
          <div className="suggestions">
            {resultats.map(produit => {
              const dispo = stockBoites(produit.id);
              return (
                <button key={produit.id} onClick={() => { ajouter(produit.id); setTerm(''); }}>
                  <div className="row row--tight">
                    <strong>{produit.name}</strong>
                    <small>{produit.code}</small>
                    <div className="spacer" />
                    <Badge tone="ok">{integer(dispo)} en stock vendable</Badge>
                  </div>
                  <small>{produit.presentation || produit.dosage || produit.form || ''} {produit.unit ? `· ${produit.unit}` : ''}</small>
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
        <div className="row" style={{ marginTop: 14 }}>
          <Btn icon={RefreshCw} onClick={chargerDevis} disabled={!panier.length || busy}>Recalculer le total</Btn>
          <span className="muted" style={{ fontSize: '.84rem' }}>
            Le stock proposé est celui de la PHARMACIE (comptoir) et il sort en FEFO (premier périmé, premier sorti).
            Ce qui reste au dépôt doit d’abord être transféré.
          </span>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- 2 */}
      <Card title={`2 · Panier${panier.length ? ` — ${integer(unites)} article(s)` : ''}`} flush
        actions={panier.length ? <Btn variant="ghost" icon={Trash2} onClick={viderPanier}>Vider le panier</Btn> : null}>
        {avertissement ? (
          <div style={{ padding: '0 16px 12px' }}>
            <Banner tone="warn" title="Quantité limitée au stock du comptoir">{avertissement}</Banner>
          </div>
        ) : null}
        {panier.length === 0 ? <Empty>Panier vide : recherchez un médicament pour commencer.</Empty> : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Médicament</th>
                  <th className="num">Stock vendable</th>
                  <th>Unité vendue</th>
                  <th>Quantité</th>
                  <th className="num">Prix unitaire</th>
                  <th className="num">Total ligne</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {panier.map(ligne => {
                  const produit = product(ligne.productId);
                  const maximum = maximumDe(ligne.productId, ligne.saleUnit);
                  const trouve = devis?.lines?.filter(item => item.productId === ligne.productId) || [];
                  const prix = trouve[0]?.unitPrice;
                  const facteur = facteurUnite(produit, ligne.saleUnit);
                  return (
                    <tr key={`${ligne.productId}-${ligne.saleUnit}`}>
                      <td className="wrap">{productName(ligne.productId)}</td>
                      <td className="num">{integer(maximum)}</td>
                      <td>
                        {/* 2.7.12 — choix Boîte / Plaquette / Comprimé par ligne.
                            Une sous-unité sans conditionnement (0 dans la fiche)
                            est proposée mais grisée avec une explication. */}
                        <div className="row row--tight" style={{ gap: 4, flexWrap: 'wrap' }}>
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
                      </td>
                      <td>
                        <div className="counter">
                          <button onClick={() => modifier(ligne, -1)} aria-label="Diminuer"><Minus size={14} /></button>
                          <strong style={{ minWidth: 34, textAlign: 'center' }}>{ligne.quantity}</strong>
                          <button onClick={() => modifier(ligne, 1)} aria-label="Augmenter"
                            disabled={ligne.quantity >= maximum}
                            title={ligne.quantity >= maximum
                              ? `Maximum vendable au comptoir : ${maximum} ${UNITE_PLURIEL(ligne.saleUnit)}`
                              : `Ajouter une ${UNITE_LABEL(ligne.saleUnit).toLowerCase()}`}>
                            <Plus size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="num">{prix ? money(prix) : '—'}</td>
                      <td className="num">{prix ? money(Number(prix) * ligne.quantity) : '—'}</td>
                      <td className="right">
                        <Btn variant="ghost" icon={Trash2} onClick={() => retirer(ligne)} aria-label="Retirer" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---------------------------------------------------------------- 3 */}
      <Card title="3 · Client, remarque et validation"
        actions={<Badge tone={panier.length ? 'info' : 'default'}>
          {panier.length ? `${integer(unites)} article(s)` : 'panier vide'}
        </Badge>}>
        <div className="grid grid--2">
          <Field label="Client (facultatif)" hint="Choisissez un client déjà servi ou laissez « Client de passage »">
            <Input list="clients-connus" value={client} onChange={e => setClient(e.target.value)} placeholder="Client de passage" />
            <datalist id="clients-connus">
              {clientsConnus.map(nom => <option key={nom} value={nom} />)}
            </datalist>
            {clientsConnus.length ? (
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Btn size="sm" variant={client === '' ? 'primary' : 'ghost'} onClick={() => setClient('')}>Client de passage</Btn>
                {clientsConnus.slice(0, 4).map(nom => (
                  <Btn key={nom} size="sm" variant={client === nom ? 'primary' : 'ghost'} onClick={() => setClient(nom)}>{nom}</Btn>
                ))}
              </div>
            ) : null}
          </Field>
          <Field label="Remarque (facultative)">
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Ordonnance, précision de vente…" />
          </Field>
        </div>

        {devis ? (
          <>
            <div className="table-scroll" style={{ marginTop: 6 }}>
              <table className="data">
                <thead><tr><th>Médicament</th><th>Lot retenu (FEFO)</th><th>Expiration</th><th className="num">Qté</th><th className="num">PU</th></tr></thead>
                <tbody>
                  {devis.lines.map((ligne, index) => (
                    <tr key={index}>
                      <td className="wrap">
                        {ligne.product || '—'}
                        {ligne.saleUnit && ligne.saleUnit !== 'BOX'
                          ? <Badge tone="info" style={{ marginLeft: 6 }}>{UNITE_LABEL(ligne.saleUnit)}</Badge> : null}
                      </td>
                      <td>{ligne.lot}</td>
                      <td>{ligne.expiresOn ? new Date(ligne.expiresOn).toLocaleDateString('fr-FR') : 'non daté'}</td>
                      <td className="num">{integer(Number(ligne.saleQuantity ?? ligne.quantity))}</td>
                      <td className="num">{money(ligne.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="total-line total-line--grand">
              <span>Total à encaisser ({integer(devis.lines.reduce((total, ligne) => total + Number(ligne.saleQuantity ?? ligne.quantity), 0))} article(s))</span>
              <strong>{money(devis.total)}</strong>
            </div>
            {can('prices') ? <div className="total-line muted"><span>Coût retenu</span><span>{money(devis.costTotal)}</span></div> : null}
            {can('prices') ? <div className="total-line muted"><span>Marge brute</span><span>{money(devis.margin)}</span></div> : null}
          </>
        ) : (
          <Banner tone="info">
            {panier.length
              ? 'Le total se calcule dès que le stock et les prix du serveur ont répondu — appuyez sur « Recalculer le total » pour voir le détail.'
              : 'Le total est calculé par le serveur à partir du stock réel : ajoutez un médicament au panier.'}
          </Banner>
        )}

        {error ? <div style={{ marginTop: 12 }}><ErrorBox error={error} /></div> : null}

        <div style={{ marginTop: 14 }}>
          <Btn variant="primary" size="lg" className="btn--block" icon={Check}
            disabled={!panier.length || busy} onClick={valider}>
            {busy ? 'Enregistrement…' : `Valider la vente${devis ? ` — ${money(devis.total)}` : ''}`}
          </Btn>
          <p className="muted" style={{ fontSize: '.8rem', marginTop: 8, textAlign: 'center' }}>
            Une vente validée ne se supprime jamais : en cas d’erreur, elle s’annule depuis le bouton
            « Historique de vente » en haut de cette page (trace conservée, stock remis en place).
          </p>
        </div>

        {cloture ? (
          <Banner tone="ok" title={`Vente ${cloture.reference} enregistrée — ${money(cloture.total)}`}>
            <div className="row row--tight" style={{ marginTop: 8 }}>
              <Btn icon={Printer} onClick={() => openPrintable(`/documents/SALE/${cloture.id}/print`)}>Imprimer le ticket</Btn>
              <Btn variant="ghost" icon={History} onClick={() => { setCloture(null); setHistoriqueOuvert(true); }}>Historique de vente</Btn>
              <Btn variant="ghost" icon={ShoppingCart} onClick={() => { setCloture(null); searchRef.current?.focus(); }}>
                Vente suivante
              </Btn>
            </div>
          </Banner>
        ) : null}
      </Card>

      {historiqueOuvert ? <SaleHistoryModal onClose={() => setHistoriqueOuvert(false)} /> : null}
    </div>
  );
}