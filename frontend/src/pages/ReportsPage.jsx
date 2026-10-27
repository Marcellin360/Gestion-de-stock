// ============================================================================
// Menu « Stock » : LA FICHE DE STOCK du magasin — le registre de la période
// (stock initial · entrées · sorties · stock final · valeur).
//
// 2.7.17 — écran épuré à la demande du comptoir :
//   • la carte « Paramètres du rapport » et le sélecteur « Rapport » sont
//     retirés : l'écran n'affiche QUE la fiche de stock du magasin du profil
//     (pharmacie pour le comptoir, dépôt pour la réserve) ;
//   • ne restent que six commandes : Recalculer · Contrôle d'intégrité ·
//     Aujourd'hui · 7 jours · Ce mois · Tout ;
//
// 2.7.46 — le DÉPÔT rejoint la PHARMACIE : le stock s'affiche EN TABLEAU
//   (Médicament · Catégorie · Unité · Stock initial · Entrées · Sorties ·
//   Stock final · Coût unitaire · Valeur), avec la même recherche par nom —
//   les « fiches / cartes » par médicament (2.7.20) sont retirées ;
//   • bouton « Détail boîte / plaquette » : bascule l'affichage entre le
//     registre classique et le détail des sorties / stock final découpés par
//     PRISE (boîte entière d'un côté, plaquettes de l'autre) — sans recalcul,
//     le serveur fournit les deux jeux de colonnes ;
//   • « Seuil minimum » et « Situation » : toujours calculés côté serveur
//     (le calcul ne change pas) mais plus AFFICHÉS à l'écran — CSV et
//     impression restent complets.
//
// 2.7.71 — nouvelle demande du comptoir (« Stock : asiana couleur ny bouton…
//   Rehefa mikitika ilay bouton imprimer koa dia tokony tonga dia
//   mitelecharge forme pdf, ary asiana entre deux date… ») :
//   • COULEURS des boutons : « Export CSV » = BLEU, « Imprimer » et
//     « Contrôle d'intégrité » = VERT (mêmes tons que la vente, 2.7.67) ;
//   • « Imprimer » TÉLÉCHARGE DIRECTEMENT le PDF de la fiche (fmt=pdf sur
//     /reports/print — rendu A4 paysage, sans page HTML à imprimer) ;
//   • saisie ENTRE DEUX DATES (« Du … Au … ») alignée avec les quatre
//     raccourcis de période ;
//   • la phrase d'explication sous les raccourcis (« Stock initial = stock
//     final de la période précédente (report automatique) · Sorties = …
//     Cliquez "Détail boîte / plaquette"… ») est SUPPRIMÉE.
//
// 2.7.78 — nouvelle demande de l'officine (« Stock : atao vert ny couleur
//   ny bouton Recalculer, ary soloina Telecharger ilay bouton Détail, ka
//   rehefa kitihina dia tonga dia mitelecharge pdf avy hatrany ») :
//   • « Recalculer » passe en VERT plein (même ton que « Imprimer ») ;
//   • côté DÉPÔT, le bouton « Detail » (boîte de dialogue 2.7.23/2.7.24) est
//     REMPLACÉ par « Telecharger » — VERT plein — qui enregistre DIRECTEMENT
//     le PDF de la fiche (même serveur que la pharmacie : `?fmt=pdf`) ;
//     la pharmacie garde son « Imprimer » vert (2.7.71) — mêmes données,
//     plus d'étape fenêtre : un clic = un PDF dans « Téléchargements ».
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Printer, RefreshCw, ShieldCheck, ListChecks, FileBarChart, Search } from 'lucide-react';
import { reports } from '../api/endpoints.js';
import { downloadCsv, downloadPdf } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useRoute } from '../utils/router.js';
import { Badge, Banner, Btn, Card, Empty, ErrorBox, Input, Spinner } from '../components/ui.jsx';
import { addDays, integer, monthStart, money, today } from '../utils/format.js';
// 2.7.71 — couleurs pleines déjà définies pour la vente (2.7.67) et message
// du repli « navigateur » : même bleu « export », même vert « imprimer ».
import {
  COULEUR_DETAIL as COULEUR_EXPORT, COULEUR_IMPRIMER as COULEUR_VERT,
  MESSAGE_PDF_NAVIGATEUR
} from '../components/SaleHistoryModal.jsx';

// « Tout » = depuis l'ouverture de la pharmacie (début très antérieur aux données).
const TOUT_DEBUT = '2000-01-01';

// Jamais affichées à l'écran (2.7.17) : seuil et situation sont calculés côté
// serveur — le calcul ne change pas, seul l'affichage de ces deux cases disparaît.
const JAMAIS_AFFICHEES = ['Seuil minimum', 'Situation'];

// 2.7.21 — ADMINISTRATEUR : la fiche affichée devient celle du DÉPÔT (pas la
// pharmacie) — les choses IMPORTANTES de la réserve s'y lisent : médicaments en
// CARTES (2.7.20), sans le bouton « Détail boîte / plaquette » (pharmacie seul).
// Au total : DEPOT et ADMIN voient la même vue (cartes du dépôt), PHARMACIST
// garde le registre du comptoir avec son bouton de détail.

// Colonnes de détail par prise, visibles uniquement en mode « Détail boîte / plaquette ».
const DETAIL = {
  'Sorties': ['Sorties boîte', 'Sorties plaquette'],
  'Stock final': ['Stock final boîte', 'Stock final plaquette']
};

export default function ReportsPage() {
  const toast = useToast();
  const { can, user } = useAuth();
  // Le profil DÉPÔT suit la réserve, les autres profils le comptoir :
  // la fiche affichée est celle de son magasin (pas de sélecteur de rapport).
  // 2.7.21/2.7.22 — l'ADMINISTRATEUR voit les DEUX : « Stock » (menu Dépôt,
  // adresse #/rapports) = fiche de la RÉSERVE en cartes ; « Stock (pharmacie) »
  // (menu Pharmacie, adresse #/stock-pharmacie, 2.7.22) = registre du comptoir.
  const route = useRoute();
  const estDepot = user?.roleCode === 'DEPOT'
    || (user?.roleCode === 'ADMIN' && route !== 'stock-pharmacie');
  const type = estDepot ? 'fiche_depot' : 'fiche';
  const libelleMagasin = estDepot ? 'dépôt (réserve)' : 'pharmacie (comptoir)';
  // 2.7.21 — le bouton « Détail boîte / plaquette » n'existe plus que pour la
  // PHARMACIE (ADMIN + DEPOT = cartes du dépôt, sans découpe de prise).
  const avecBoutonDetail = user?.roleCode === 'PHARMACIST';

  const [filtres, setFiltres] = useState({ from: monthStart(), to: today() });
  const [resultat, setResultat] = useState(null);
  // 2.7.37 — teboka ② / ③ : recherche par NOM de médicament + (comptoir)
  // seuls les médicaments effectivement TRANSFÉRÉS depuis le dépôt s'affichent
  // (les fiches jamais approvisionnées n'encombrent plus l'écran).
  const [recherche, setRecherche] = useState('');
  const [integrite, setIntegrite] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // false = registre classique (Sorties · Stock final) — true = détail par prise.
  const [detail, setDetail] = useState(false);

  const charger = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setResultat(await reports.load({ type, from: filtres.from, to: filtres.to }));
    } catch (cause) {
      setError(cause);
      setResultat(null);
    } finally {
      setBusy(false);
    }
  }, [type, filtres.from, filtres.to]);

  useEffect(() => { charger(); }, [charger]);

  // 2.7.71 — téléchargement PDF (même repli « navigateur » que la page Vente :
  // si la protection web locale bloque le fetch, le navigateur prend le relais).
  const telechargerPdf = (chemin, nomFichier) => downloadPdf(chemin, nomFichier)
    .then(result => {
      if (result?.via === 'navigateur') toast.warn(MESSAGE_PDF_NAVIGATEUR);
    })
    .catch(cause => toast.error(cause.message || 'Téléchargement du PDF impossible.'));

  // 2.7.71 — « Imprimer » TÉLÉCHARGE DIRECTEMENT le PDF de la fiche de stock
  // (plus de page HTML à imprimer à la main dans un nouvel onglet).
  // 2.7.78 — au DÉPÔT, « Detail » devient « Telecharger » et utilise le MÊME
  // téléchargement : un clic = le PDF de la fiche, sans fenêtre intermédiaire.
  const imprimer = () => telechargerPdf(
    `/reports/print?type=${type}&from=${filtres.from}&to=${filtres.to}&fmt=pdf`,
    `fiche-stock-${type}-${filtres.from}-${filtres.to}.pdf`);

  const exporter = async () => {
    try {
      await downloadCsv(
        `/reports?type=${type}&from=${filtres.from}&to=${filtres.to}&format=csv`,
        `fiche-${estDepot ? 'depot' : 'pharmacie'}-${filtres.from}-${filtres.to}.csv`);
    } catch (cause) {
      toast.error(cause.message);
    }
  };

  const controler = async () => {
    try {
      const reponse = await reports.integrity();
      setIntegrite(reponse);
      if (reponse.ok) toast.success('Contrôle d’intégrité : aucune anomalie détectée.');
      else toast.warn(`${reponse.anomalies.length} anomalie(s) détectée(s) : consultez le détail.`);
    } catch (cause) {
      toast.error(cause.message);
    }
  };

  // Les colonnes affichées : toutes celles du serveur, sauf Seuil/Situation
  // (jamais) ; le détail remplace les deux cases classiques par les 4 cases
  // « boîte / plaquette ».
  const lignes = useMemo(() => {
    let liste = resultat?.rows || [];
    // 2.7.37 — teboka ③ : sur la fiche du COMPTOIR, seuls les médicaments
    // effectivement arrêtés par un transfert du dépôt (ou déjà présents)
    // figurent — la table n'affiche que « ce qui est passé à la pharmacie ».
    if (!estDepot) {
      liste = liste.filter(ligne =>
        Number(ligne['Stock initial'] || 0) > 0
        || Number(ligne['Entrées'] || 0) > 0
        || Number(ligne['Stock final'] || 0) > 0);
    }
    // 2.7.37 — teboka ② : recherche par nom de médicament (dès 1 caractère).
    const needle = recherche.trim().toLowerCase();
    if (needle) {
      liste = liste.filter(ligne => String(ligne['Médicament'] || '').toLowerCase().includes(needle));
    }
    return liste;
  }, [resultat, estDepot, recherche]);
  const serveurKeys = lignes.length ? Object.keys(lignes[0]).filter(k => !JAMAIS_AFFICHEES.includes(k)) : [];
  // 2.7.37 — teboka ② : la colonne « Code » n'apparaît plus dans les TABLEAUX
  // (elle reste dans l'export CSV et dans les cartes du dépôt, inchangé).
  const colonnesSimples = serveurKeys.filter(k => !['Code', 'Sorties boîte', 'Sorties plaquette', 'Stock final boîte', 'Stock final plaquette'].includes(k));

  const cellule = (ligne, colonne) => {
    const valeur = ligne[colonne];
    if (colonne.match(/montant|valeur|prix|marge|cout|coût/i)) return <td key={colonne} className="num">{money(valeur)}</td>;
    if (typeof valeur === 'number') return <td key={colonne} className="num">{integer(valeur)}</td>;
    return <td key={colonne} className="wrap">{valeur ?? ''}</td>;
  };

  return (
    <>
      <Card title={`Fiche de stock — ${libelleMagasin}`}
        actions={<>
          {/* 2.7.78 — « Recalculer » passe en VERT plein (demande de l'officine). */}
          <Btn variant="ghost" style={COULEUR_VERT} icon={RefreshCw} onClick={charger} disabled={busy}>{busy ? 'Chargement…' : 'Recalculer'}</Btn>
          {/* 2.7.71 — « Contrôle d'intégrité » en VERT plein (comme « Imprimer »). */}
          {can('audit') ? <Btn variant="ghost" style={COULEUR_VERT} icon={ShieldCheck}
            onClick={controler}>Contrôle d’intégrité</Btn> : null}
        </>}>
        <div className="row row--tight" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          {/* 2.7.17 — les seules commandes de la période : quatre raccourcis. */}
          <Btn variant="ghost" onClick={() => setFiltres({ from: today(), to: today() })}>Aujourd’hui</Btn>
          <Btn variant="ghost" onClick={() => setFiltres({ from: addDays(-7), to: today() })}>7 jours</Btn>
          <Btn variant="ghost" onClick={() => setFiltres({ from: monthStart(), to: today() })}>Ce mois</Btn>
          <Btn variant="ghost" onClick={() => setFiltres({ from: TOUT_DEBUT, to: today() })}>Tout</Btn>
          {/* 2.7.71 — saisie ENTRE DEUX DATES, ALIGNÉE avec les quatre
              raccourcis : « ilay entre deux date mifanitsy ami'ny Aujourd'hui,
              7 jours, Ce mois, Tout ». Changer une borne recharge la fiche. */}
          <span className="row row--tight" style={{ alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: '.85rem', fontWeight: 600 }} aria-hidden="true">Du</span>
            <Input type="date" value={filtres.from} max={filtres.to}
              onChange={e => setFiltres(f => ({ ...f, from: e.target.value }))}
              style={{ width: 150 }} aria-label="Du (début de la période)" />
            <span className="muted" style={{ fontSize: '.85rem', fontWeight: 600 }} aria-hidden="true">Au</span>
            <Input type="date" value={filtres.to} min={filtres.from || undefined}
              onChange={e => setFiltres(f => ({ ...f, to: e.target.value }))}
              style={{ width: 150 }} aria-label="Au (fin de la période)" />
          </span>
          <Badge tone="info">
            du {new Date(`${filtres.from}T12:00:00`).toLocaleDateString('fr-FR')} au{' '}
            {new Date(`${filtres.to}T12:00:00`).toLocaleDateString('fr-FR')}
          </Badge>
          <div className="spacer" />
          {/* Le bouton demandé (2.7.17) : voir le détail des sorties et du stock
              final découpés en boîtes et plaquettes (et revenir au registre).
              2.7.20/2.7.21 — PHARMACIE SEULEMENT : au DÉPÔT comme à l'ADMINISTRATEUR,
              le bouton est retiré (la réserve se gère par boîtes entières). */}
          {avecBoutonDetail ? (
            <Btn variant={detail ? 'default' : 'ghost'} icon={ListChecks}
              onClick={() => setDetail(valeur => !valeur)}>
              {detail ? 'Vue registre' : 'Détail boîte / plaquette'}
            </Btn>
          ) : null}
        </div>
        {/* 2.7.71 — la phrase d'explication (« Stock initial = stock final de
            la période précédente (report automatique) · Sorties = ventes,
            pertes, écarts · Cliquez \"Détail boîte / plaquette\"… ») est
            SUPPRIMÉE, à la demande du comptoir. */}
      </Card>

      {integrite ? (
        <Banner tone={integrite.ok ? 'ok' : 'error'} title={integrite.ok ? 'Stock cohérent : lot = somme des mouvements' : 'Anomalies détectées'}>
          {integrite.ok ? `Contrôle effectué sur l’ensemble des lots (${today()}).` : (
            <ul>{integrite.anomalies.slice(0, 20).map((anomalie, index) => <li key={index}>{JSON.stringify(anomalie)}</li>)}</ul>
          )}
        </Banner>
      ) : null}

      {error ? <ErrorBox error={error} /> : null}

      {resultat?.totals ? (
        <Banner tone="info" title={`Totaux du magasin (${libelleMagasin})`}>
          Stock initial : {integer(resultat.totals.initial)} · Entrées : {integer(resultat.totals.entrees)}
          {' '}· Sorties : {integer(resultat.totals.sorties)} · Stock final : {integer(resultat.totals.final)}
          {' '}· Valeur : {money(resultat.totals.valeur)}
        </Banner>
      ) : null}

      <Card title={`${lignes.length} médicament(s) sur la période`}
        actions={<>
          {/* 2.7.37 — teboka ② : recherche par nom de médicament dans le tableau. */}
          <div className="row row--tight" style={{ alignItems: 'center' }}>
            <Search size={14} className="muted" />
            <Input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Recherche : nom du médicament…" style={{ width: 260 }}
              aria-label="Recherche par nom de médicament" />
          </div>
          {/* 2.7.71 — « Export CSV » en BLEU plein (« couleur bleu »). */}
          <Btn variant="ghost" style={COULEUR_EXPORT} icon={Download}
            onClick={exporter} disabled={!lignes.length}>Export CSV</Btn>
          {/* 2.7.78 — DÉPÔT : l'ancien « Detail » (boîte de dialogue 2.7.23/24)
              est REMPLACÉ par « Telecharger », en VERT plein : un clic et le
              PDF de la fiche se télécharge immédiatement (comme « Imprimer »
              de la pharmacie, 2.7.71) — plus de fenêtre intermédiaire. */}
          {estDepot ? (
            <Btn variant="ghost" style={COULEUR_VERT} icon={Download}
              disabled={!lignes.length} onClick={imprimer}>Telecharger</Btn>
          ) : (
            <Btn variant="ghost" style={COULEUR_VERT} icon={Printer}
              disabled={!lignes.length} onClick={imprimer}>Imprimer</Btn>
          )}
        </>} flush>
        {busy ? <Spinner page /> : !lignes.length ? (
          <Empty><FileBarChart size={22} /> Aucun médicament actif sur cette période.</Empty>
        ) : detail ? (
          /* ── Vue DÉTAIL : en-tête à deux étages comme le registre papier —
             « Sorties » et « Stock final » sont chacun coupés en Boîte | Plaquette. */
          (() => {
            // Construction « un élément de colonne » : simple ou groupe (2 sous-cases).
            const unites = colonnesSimples.map(colonne => (DETAIL[colonne]
              ? { groupe: colonne, sous: DETAIL[colonne] }
              : { simple: colonne }));
            return (
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      {unites.map(unite => unite.simple ? (
                        <th key={unite.simple} rowSpan={2}
                          className={typeof lignes[0][unite.simple] === 'number' ? 'num' : ''}>{unite.simple}</th>
                      ) : (
                        <th key={unite.groupe} colSpan={2} className="num">{unite.groupe}</th>
                      ))}
                    </tr>
                    <tr>
                      {/* Deuxième étage : les sous-cases « Boîte » et « Plaquette »,
                          une paire sous chaque groupe (Sorties, Stock final). */}
                      {unites.filter(unite => unite.groupe).flatMap(unite =>
                        unite.sous.map((sous, rang) => (
                          <th key={sous} className="num">{rang === 0 ? 'Boîte' : 'Plaquette'}</th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((ligne, index) => (
                      <tr key={index}>
                        {unites.map(unite => unite.simple
                          ? cellule(ligne, unite.simple)
                          : unite.sous.map(sous => cellule(ligne, sous)))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead><tr>{colonnesSimples.map(colonne => (
                <th key={colonne} className={typeof lignes[0][colonne] === 'number' ? 'num' : ''}>{colonne}</th>
              ))}</tr></thead>
              <tbody>
                {lignes.map((ligne, index) => (
                  <tr key={index}>{colonnesSimples.map(colonne => cellule(ligne, colonne))}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}