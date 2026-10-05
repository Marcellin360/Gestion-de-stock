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
//   • bouton « Détail boîte / plaquette » : bascule l'affichage entre le
//     registre classique et le détail des sorties / stock final découpés par
//     PRISE (boîte entière d'un côté, plaquettes de l'autre) — sans recalcul,
//     le serveur fournit les deux jeux de colonnes ;
//   • « Seuil minimum » et « Situation » : toujours calculés côté serveur
//     (le calcul ne change pas) mais plus AFFICHÉS à l'écran — CSV et
//     impression restent complets.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { Download, Printer, RefreshCw, ShieldCheck, ListChecks, FileBarChart, Eye } from 'lucide-react';
import { reports } from '../api/endpoints.js';
import { downloadCsv, openPrintable } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useRoute } from '../utils/router.js';
import { Badge, Banner, Btn, Card, Empty, ErrorBox, Modal, Spinner } from '../components/ui.jsx';
import { addDays, integer, monthStart, money, today } from '../utils/format.js';

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

// ============================================================================
// 2.7.20 — VUE CARTES (DÉPÔT) : « atao sous forme carte ny médicaments ».
// Chaque médicament de la période est présenté en carte (nom, code, code-barres
// d'infos du registre : initial → entrées → sorties → final, seuil calculé
// mais jamais affiché — 2.7.17), lisible d'un coup d'œil sans tableau.
// ============================================================================
function CarteMedicament({ ligne }) {
  const enRupture = Number(ligne['Stock final']) <= 0;
  return (
    <div style={{
      border: `1px solid ${enRupture ? 'var(--error, #dc2626)' : 'var(--line, #e2e8f0)'}`,
      borderRadius: 10, padding: '10px 12px',
      background: 'var(--bg-surface, #fff)',
      /* 4 lignes de chiffres par carte (initial/entrées/sorties/valeur), hors nom. */
      breakInside: 'avoid'
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '.95rem' }}>{ligne['Médicament']}</strong>
        <span className="muted" style={{ fontSize: '.78rem' }}>{ligne['Code']}</span>
        <span className="muted" style={{ fontSize: '.78rem' }}>{ligne['Catégorie']} · {ligne['Unité']}</span>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
        marginTop: 8, textAlign: 'center'
      }}>
        {[
          ['Stock initial', ligne['Stock initial'], 'var(--text-muted, #64748b)'],
          ['Entrées', ligne['Entrées'], 'var(--ok, #15803d)'],
          ['Sorties', ligne['Sorties'], 'var(--warn, #b45309)'],
          ['Stock final', ligne['Stock final'], enRupture ? 'var(--error, #dc2626)' : 'var(--primary, #2563eb)']
        ].map(([libelle, quantite, couleur]) => (
          <div key={libelle} style={{ background: 'var(--bg-notch, #f8fafc)', borderRadius: 8, padding: '5px 4px' }}>
            <div style={{ fontSize: '.68rem', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)' }}>{libelle}</div>
            <div style={{ fontWeight: 700, color: couleur }}>{integer(quantite)}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: '.8rem', flexWrap: 'wrap' }}>
        <span className="muted">Coût unitaire : {money(ligne['Coût unitaire (Ar)'])}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 600 }}>Valeur : {money(ligne['Valeur (Ar)'])}</span>
      </div>
    </div>
  );
}

// ============================================================================
// 2.7.23 — DÉPÔT : « Imprimer » devient « Detail ».
// Une BOÎTE DE DIALOGUE s'ouvre dans la page (plus de nouvel onglet navigateur)
// avec le contenu du rapport, MAIS SANS :
//   • les quatre colonnes de découpe par prise (« Sorties boîte », « Sorties
//     plaquette », « Stock final boîte », « Stock final plaquette ») : il ne
//     reste que « Sorties » et « Stock final » (la découpe ne concerne que la
//     pharmacie — inchangée chez elle) ;
//   • les colonnes « Seuil minimum » et « Situation » (2.7.17 : jamais affichées) ;
//   • la métadonnée « Édité par … · Lignes affichées … » ;
//   • le bloc statistique de pied (ventes · marge · pertes · achats · transferts
//     · mouvements).
// ============================================================================
const COLONNES_CACHEES_MODAL = ['Seuil minimum', 'Situation',
  'Sorties boîte', 'Sorties plaquette', 'Stock final boîte', 'Stock final plaquette'];

function DetailStockModal({ lignes, from, to, onClose }) {
  const colonnes = lignes.length
    ? Object.keys(lignes[0]).filter(colonne => !COLONNES_CACHEES_MODAL.includes(colonne))
    : [];
  const cellule = (ligne, colonne) => {
    const valeur = ligne[colonne];
    if (colonne.match(/montant|valeur|prix|marge|cout|coût/i)) return <td key={colonne} className="num">{money(valeur)}</td>;
    if (typeof valeur === 'number') return <td key={colonne} className="num">{integer(valeur)}</td>;
    return <td key={colonne} className="wrap">{valeur ?? ''}</td>;
  };
  return (
    <Modal title={<span>Détail — stock dépôt (réserve)
        <span className="muted" style={{ display: 'block', fontSize: '.82rem', fontWeight: 400 }}>
          du {new Date(`${from}T12:00:00`).toLocaleDateString('fr-FR')} au{' '}
          {new Date(`${to}T12:00:00`).toLocaleDateString('fr-FR')} · {lignes.length} médicament(s) sur la période
        </span>
      </span>}
      onClose={onClose}
      size="detail"
      footer={<Btn variant="primary" onClick={onClose}>Fermer</Btn>}>
      {lignes.length === 0 ? (
        <Empty>Aucun médicament actif sur cette période.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="data">
            <thead><tr>{colonnes.map(colonne => (
              <th key={colonne} className={typeof lignes[0][colonne] === 'number' ? 'num' : ''}>{colonne}</th>
            ))}</tr></thead>
            <tbody>
              {lignes.map((ligne, index) => (
                <tr key={index}>{colonnes.map(colonne => cellule(ligne, colonne))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

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
  const [integrite, setIntegrite] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // false = registre classique (Sorties · Stock final) — true = détail par prise.
  const [detail, setDetail] = useState(false);
  // 2.7.23 — boîte de dialogue « Detail » du dépôt (remplace l'impression).
  const [detailModal, setDetailModal] = useState(false);

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
  const lignes = resultat?.rows || [];
  const serveurKeys = lignes.length ? Object.keys(lignes[0]).filter(k => !JAMAIS_AFFICHEES.includes(k)) : [];
  const colonnesSimples = serveurKeys.filter(k => !['Sorties boîte', 'Sorties plaquette', 'Stock final boîte', 'Stock final plaquette'].includes(k));

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
          <Btn icon={RefreshCw} onClick={charger} disabled={busy}>{busy ? 'Chargement…' : 'Recalculer'}</Btn>
          {can('audit') ? <Btn variant="ghost" icon={ShieldCheck} onClick={controler}>Contrôle d’intégrité</Btn> : null}
        </>}>
        <div className="row row--tight" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          {/* 2.7.17 — les seules commandes de la période : quatre raccourcis. */}
          <Btn variant="ghost" onClick={() => setFiltres({ from: today(), to: today() })}>Aujourd’hui</Btn>
          <Btn variant="ghost" onClick={() => setFiltres({ from: addDays(-7), to: today() })}>7 jours</Btn>
          <Btn variant="ghost" onClick={() => setFiltres({ from: monthStart(), to: today() })}>Ce mois</Btn>
          <Btn variant="ghost" onClick={() => setFiltres({ from: TOUT_DEBUT, to: today() })}>Tout</Btn>
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
        <p className="muted" style={{ fontSize: '.82rem', margin: '8px 0 0' }}>
          <strong>Stock initial</strong> = stock final de la période précédente (report automatique) ·
          <strong> Sorties</strong> = ventes, pertes, écarts{estDepot ? ' et transferts vers la pharmacie' : ''}
          {/* 2.7.21 — la consigne « Détail boîte / plaquette » n'a pas lieu
              d'être hors pharmacie : sans bouton, pas de phrase à ce sujet. */}
          {avecBoutonDetail ? (detail
            ? ' · Détail par prise : la case « boîte » compte les boîtes entières, la case « plaquette » le reste.'
            : ' · Cliquez « Détail boîte / plaquette » pour séparer boîtes et plaquettes.')
            : '.'}
        </p>
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
          <Btn variant="ghost" icon={Download} onClick={exporter} disabled={!lignes.length}>Export CSV</Btn>
          {/* 2.7.23 — DÉPÔT : « Imprimer » devient « Detail » : une boîte de
              dialogue s'ouvre DANS CETTE PAGE (plus d'onglet navigateur). La
              pharmacie, elle, garde « Imprimer » qui ouvre la page imprimable. */}
          {estDepot ? (
            <Btn variant="ghost" icon={Eye} disabled={!lignes.length}
              onClick={() => setDetailModal(true)}>Detail</Btn>
          ) : (
            <Btn variant="ghost" icon={Printer} disabled={!lignes.length}
              onClick={() => openPrintable(`/reports/print?type=${type}&from=${filtres.from}&to=${filtres.to}`)}>Imprimer</Btn>
          )}
        </>} flush>
        {busy ? <Spinner page /> : !lignes.length ? (
          <Empty><FileBarChart size={22} /> Aucun médicament actif sur cette période.</Empty>
        ) : estDepot ? (
          /* 2.7.20/2.7.21 — DÉPÔT et ADMINISTRATEUR : les médicaments de la
             période affichés EN CARTES, une fiche claire par médicament (plus
             de tableau ni de découpe boîte/plaquette). Grille responsive :
             3 cols ≥1200px, 2 cols ≥ 760px, 1 col sur téléphone. */
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 10, padding: '12px'
          }}>
            {lignes.map((ligne, index) => <CarteMedicament key={ligne['Code'] || index} ligne={ligne} />)}
          </div>
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

      {/* 2.7.23 — la boîte de dialogue « Detail » du dépôt : contenu réduit
          (sans les quatre colonnes de découpe, sans seuil/situation, sans
          métadonnées ni bloc statistique de pied). */}
      {detailModal ? (
        <DetailStockModal lignes={lignes} from={filtres.from} to={filtres.to}
          onClose={() => setDetailModal(false)} />
      ) : null}
    </>
  );
}