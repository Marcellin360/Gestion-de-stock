// Tableau de bord : ce qui se passe aujourd'hui dans l'officine et ce qui
// demande une décision (alertes rouges en tête : rupture, péremption, lot bloqué).
//
// 2.7.12 — profil PHARMACIE épuré (voalavana n'ilay mpampiasa) :
//   • l'affichage du DÉPÔT (carte magasin) est retiré : le comptoir ne voit
//     que la PHARMACIE ;
//   • le raccourci « Transfert vers la pharmacie » est retiré des actions ;
//   • la carte « Derniers transferts dépôt → pharmacie » (historique de
//     transfert / Nouveau transfert) est retirée du tableau de bord.
// Le profil DÉPÔT, lui, garde tout son tableau de bord inchangé : réceptionner
// la marchandise et la transférer vers le comptoir est son travail quotidien.
//
// 2.7.18 — le CALENDRIER DES VENTES quitte le tableau de bord : il a son propre
// menu sous « Vente ». Le tableau de bord, lui, affiche désormais un
// HISTOGRAMME « total encaissé par mois » (12 derniers mois) — la vue d'ensemble
// que demande le comptoir, sans détail journalier.
//
// 2.7.20 — côté DÉPÔT :
//   • la carte récapitulative des derniers transferts est RETIRÉE du tableau
//     de bord (l'historique vit dans le menu « Historique de transfert » et le
//     détail J/J dans le menu « Calendrier des stock ») ;
//   • un GRAPHIQUE des flux mensuels prend sa place : médicaments entrés vs
//     sortis chaque mois (12 derniers mois).
//
// 2.7.77 — FORMES DE LA MAQUETTE (demande de l'officine, INTERFACE SEULEMENT,
//   aucune fonctionnalité ne change) : groupes blancs à fine bordure latérale
//   d'accent (bleu = mois, orange = jour, vert = stock, rose = références),
//   TUILES PLEINES en dégradé de la couleur du groupe (texte blanc, petite
//   icône discrète en haut à droite), et chaque tuile SE SOULÈVE doucement au
//   passage du curseur (mouvement demandé).
import { AlertTriangle, ShoppingCart, PackagePlus, PackageMinus, ArrowRight, ArrowRightLeft, Warehouse, TrendingUp, Package, Pill, Layers, XCircle } from 'lucide-react';
import SalesHistogram from '../components/SalesHistogram.jsx';
import DepotFlowChart from '../components/DepotFlowChart.jsx';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Banner, Btn, Card, Empty } from '../components/ui.jsx';
import { navigate } from '../utils/router.js';
import { expiryLabel, integer, money, LOCATION_SHORT } from '../utils/format.js';

/** Libellé du mois courant (AAAA-MM → « octobre 2026 »), à l'abri des fuseaux. */
const nomDuMois = mois => new Date(`${mois}-15T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
/** Montant moyen d'une vente sur le mois (0 tant qu'aucune vente validée). */
const panierMoyen = mois => (Number(mois?.salesMonthCount || 0) > 0
  ? Number(mois.salesMonth || 0) / Number(mois.salesMonthCount)
  : 0);

// 2.7.77 — tuile d'indicateur (maquette) : petit libellé, grand chiffre, note,
// icône discrète en haut à droite. `sombre` = variante plus foncée du groupe
// (tuiles « Pertes ») ; `ton` colore directement la tuile sans groupe
// (cartes magasin). Le contenu (label / valeur / hint) est celui d'avant.
const Tuile = ({ label, valeur, hint, icone: Icone, sombre, ton }) => (
  <div className={`dtuile${ton ? ` dtuile--${ton}` : ''}${sombre ? ' dtuile--sombre' : ''}`}>
    {Icone ? <Icone size={16} className="dtuile__icone" aria-hidden="true" /> : null}
    <div className="dtuile__label">{label}</div>
    <div className="dtuile__value">{valeur}</div>
    {hint ? <div className="dtuile__hint">{hint}</div> : null}
  </div>
);

export default function DashboardPage() {
  // 2.7.20 — documents n'est plus exploité ici (carte transferts retirée).
  const { stats, alerts, lots, products, store, userName, month } = useData();
  const { can, user } = useAuth();
  // Le profil DÉPÔT ne travaille que sur la réserve : son tableau de bord ne
  // montre QUE le dépôt (aucune valeur, vente ni alerte de la pharmacie).
  const estDepot = user?.roleCode === 'DEPOT';
  // 2.7.21 — l'ADMINISTRATEUR voit TOUJOURS les choses importantes des DEUX
  // magasins : la carte Pharmacie garde sa place (2.7.19) et la carte Dépôt
  // (valeur, médicaments, ruptures) s'y ajoute, ainsi que le graphique des flux.
  const estAdmin = user?.roleCode === 'ADMIN';
  // 2.7.12 — profil pharmacie : l'affichage du dépôt est retiré (carte DEPOT
  // masquée) ; le dépôt, lui, ne montre que sa réserve comme avant.
  const magasins = (estDepot ? ['DEPOT'] : estAdmin ? ['PHARMACY', 'DEPOT'] : ['PHARMACY'])
    .map(code => ({ code, ...store(code) }));
  // Indicateurs du haut : ceux du magasin du profil pour le dépôt, globaux sinon.
  const tuiles = estDepot ? (store('DEPOT').stats || {}) : stats;
  // Nombre de références en rupture (alerte de type RUPTURE) — utile au dépôt
  // pour savoir quoi réapprovisionner, sans jamais afficher la pharmacie.
  const rupturesDe = liste => (liste || []).filter(alerte => alerte.type === 'RUPTURE').length;
  // 2.7.20 — plus de carte « derniers transferts » : pas besoin de les retenir.

  const rouges = alerts.filter(alert => alert.level === 'red');
  // Une alerte s'affiche toujours par son titre et le médicament concerné.
  const libelle = alert => {
    // 2.7.28 — pour le DÉPÔT, les alertes venues de la PHARMACIE (bientôt
    // épuisé au comptoir) sont préfixées pour que l'origine saute aux yeux.
    const origine = estDepot && alert.location === 'PHARMACY' ? '[Pharmacie] ' : '';
    return `${origine}${alert.title || 'Alerte'}${alert.name ? ` — ${alert.name}` : ''}`;
  };
  // Libellé du bouton d'action selon la destination de l'alerte.
  const action = target => ({
    transferts: 'Transférer', lots: 'Voir les lots', losses: 'Sortir en perte', ventes: 'Vendre', inventaires: 'Inventorier'
  })[target] || 'Voir';
  // 2.7.12 — le raccourci « Transfert vers la pharmacie » n'apparaît QUE sur
  // le tableau de bord du profil dépôt (la pharmacie gère ses ventes ici).
  const actions = [
    can('sale') && { label: 'Nouvelle vente', icon: ShoppingCart, route: 'ventes', variant: 'primary' },
    can('receipt') && { label: 'Réception (dépôt)', icon: PackagePlus, route: 'receptions' },
    estDepot && can('transfer') && { label: 'Transfert vers la pharmacie', icon: ArrowRightLeft, route: 'transferts' },
    can('loss') && { label: 'Perte ou don', icon: PackageMinus, route: 'pertes' }
    // Raccourci « Inventaire » retiré (2.7.8) : même raison que le menu.
  ].filter(Boolean);

  const proches = lots
    .filter(lot => lot.expiresOn && Number(lot.quantity) > 0 && lot.status === 'AVAILABLE')
    .sort((a, b) => String(a.expiresOn).localeCompare(String(b.expiresOn)))
    .slice(0, 6);

  return (
    <div className="dboard">
      {/* ── En-tête : salutation + date à gauche, actions à droite. ─────── */}
      <div className="row" style={{ marginBottom: 14 }}>
        <div>
          <h1>Bonjour {String(user?.name || userName || '').split(' ')[0]}</h1>
          <small>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            {estDepot ? ' — état de la réserve (dépôt)' : estAdmin ? ' — état de la pharmacie (comptoir) et de la réserve (dépôt)' : ' — état de la pharmacie (comptoir)'}
          </small>
        </div>
        <div className="spacer" />
        <div className="pill-row">
          {actions.map(action => (
            <Btn key={action.route} variant={action.variant || 'default'} icon={action.icon} onClick={() => navigate(action.route)}>
              {action.label}
            </Btn>
          ))}
        </div>
      </div>

      {rouges.length ? (
        <Banner tone="error" title={`${rouges.length} point(s) à traiter aujourd’hui`}
          items={rouges.slice(0, 5).map(alert => `${libelle(alert)} · ${alert.detail}`)} />
      ) : (
        <Banner tone="ok">Aucune alerte bloquante : le stock est cohérent.</Banner>
      )}

      {/* 2.7.77 — APERÇU DE LA MAQUETTE : mêmes chiffres qu'avant (mois, jour,
          stock, références), groupes blancs à liseré coloré, tuiles pleines en
          dégradé. 2.7.33 — teboka ⑮ : les chiffres du MOIS EN COURS viennent
          du serveur (« Mois de … »), bornes à l'heure de la pharmacie ; la
          réserve voit ses achats et ses transferts, jamais la caisse de
          l'autre. */}
      <Card
        title={`Aperçu de l'activité${month ? ` — Mois de ${nomDuMois(month.month)}` : ''} — ${estDepot ? 'activité de la réserve' : 'caisse du comptoir'}`}
        actions={<Badge tone="info">depuis le 1er du mois</Badge>}>
        <div className="dboard__grille">
          {estDepot ? (
            <>
              <section className="dboard__groupe dboard__groupe--bleu">
                <h3 className="dboard__titre">Activité du mois</h3>
                <div className="dboard__rangee">
                  <Tuile icone={TrendingUp} label="Achats reçus ce mois" valeur={money(month?.receiptsMonth || 0)}
                    hint="réceptions validées (valeur d’achat)" />
                  <Tuile icone={ArrowRightLeft} label="Transferts vers la pharmacie" valeur={money(month?.transfersMonth || 0)}
                    hint={`${integer(month?.transfersMonthCount || 0)} bordereau(x) validé(s)`} />
                </div>
              </section>
              <section className="dboard__groupe dboard__groupe--orange">
                <h3 className="dboard__titre">Activité du jour</h3>
                <div className="dboard__rangee">
                  <Tuile icone={XCircle} sombre label="Pertes du jour" valeur={money(tuiles.lossesToday)}
                    hint="Casse, péremption, dons" />
                </div>
              </section>
              <section className="dboard__groupe dboard__groupe--vert">
                <h3 className="dboard__titre">État du stock</h3>
                <div className="dboard__rangee">
                  <Tuile icone={Package} label="Valeur globale du stock" valeur={money(tuiles.stockValue)}
                    hint="Selon la valorisation paramétrée" />
                  <Tuile icone={Pill} label="Médicaments actifs" valeur={integer(tuiles.activeProducts)}
                    hint={`${integer(tuiles.activeLots)} lot(s) en réserve`} />
                </div>
              </section>
              <section className="dboard__groupe dboard__groupe--rose">
                <h3 className="dboard__titre">Ruptures</h3>
                <div className="dboard__rangee">
                  <Tuile icone={AlertTriangle} label="En rupture (dépôt)" valeur={integer(rupturesDe(store('DEPOT').alerts))}
                    hint="références à réassortir" />
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="dboard__groupe dboard__groupe--bleu">
                <h3 className="dboard__titre">Activité du mois</h3>
                <div className="dboard__rangee">
                  <Tuile icone={TrendingUp} label="Ventes du mois" valeur={money(month?.salesMonth || 0)}
                    hint={`${integer(month?.salesMonthCount || 0)} vente(s) validée(s)`} />
                  <Tuile icone={TrendingUp} label="Marge du mois" valeur={money(month?.marginMonth || 0)} hint="Marge brute réalisée" />
                  <Tuile icone={ShoppingCart} label="Panier moyen" valeur={money(panierMoyen(month))} hint="Montant moyen par vente" />
                  <Tuile icone={XCircle} sombre label="Pertes du mois" valeur={money(month?.lossesMonth || 0)} hint="Casse, péremption, dons" />
                </div>
              </section>
              <section className="dboard__groupe dboard__groupe--orange">
                <h3 className="dboard__titre">Activité du jour</h3>
                <div className="dboard__rangee">
                  <Tuile icone={TrendingUp} label="Ventes du jour" valeur={money(stats.salesToday)}
                    hint={`${integer(stats.salesTodayCount || 0)} vente(s)`} />
                  {stats.marginToday !== undefined
                    ? <Tuile icone={TrendingUp} label="Marge du jour" valeur={money(stats.marginToday)} hint="Marge brute réalisée" />
                    : null}
                  <Tuile icone={XCircle} sombre label="Pertes du jour" valeur={money(stats.lossesToday)} hint="Casse, péremption, dons" />
                </div>
              </section>
              <section className="dboard__groupe dboard__groupe--vert">
                <h3 className="dboard__titre">État du stock</h3>
                <div className="dboard__rangee">
                  <Tuile icone={Package} label="Valeur globale du stock" valeur={money(stats.stockValue)}
                    hint="Selon la valorisation paramétrée" />
                  <Tuile icone={Pill} label="Médicaments actifs" valeur={integer(stats.activeProducts)}
                    hint="références suivies" />
                </div>
              </section>
              <section className="dboard__groupe dboard__groupe--rose">
                <h3 className="dboard__titre">Médicaments en stock</h3>
                <div className="dboard__rangee">
                  <Tuile icone={Layers} label="Lots en stock" valeur={`${integer(stats.activeLots)} lot(s)`}
                    hint="Toutes références confondues" />
                </div>
              </section>
            </>
          )}
        </div>
      </Card>

      {/* 2.7.19 — la carte du magasin (Pharmacie : alertes, valeur du stock,
          médicaments, ventes du jour) remonte AU-DESSUS du graphique :
          c'est le métier du comptoir, il se lit en premier. */}
      <div className="grid grid--2" style={{ marginTop: 16, marginBottom: 16 }}>
        {magasins.map(magasin => (
          <Card key={magasin.code}
            title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {magasin.code === 'DEPOT' ? <Warehouse size={18} /> : <ShoppingCart size={18} />}
              {LOCATION_SHORT[magasin.code]}
            </span>}
            actions={<Badge tone={(magasin.alerts || []).some(a => a.level === 'red') ? 'danger' : 'ok'}>
              {(magasin.alerts || []).length} alerte(s)
            </Badge>}>
            <div className="dboard__grille dboard__grille--magasin">
              <Tuile ton="vert" icone={Package} label="Valeur du stock"
                valeur={money(magasin.stats?.stockValue)}
                hint={`${integer(magasin.stats?.activeLots || 0)} lot(s)`} />
              <Tuile ton="bleu" icone={Pill} label="Médicaments"
                valeur={integer(magasin.stats?.activeProducts)}
                hint="références actives" />
              {magasin.code === 'PHARMACY'
                ? <Tuile ton="orange" icone={ShoppingCart} label="Ventes du jour"
                  valeur={money(magasin.stats?.salesToday)}
                  hint={`${integer(magasin.stats?.salesTodayCount || 0)} vente(s)`} />
                : <Tuile ton="orange" icone={AlertTriangle} label="En rupture"
                  valeur={integer(rupturesDe(magasin.alerts))}
                  hint="références à réassortir" />}
            </div>
          </Card>
        ))}
      </div>

      {/* 2.7.18/2.7.20 — chaque profil a SON graphique mensuel : la courbe des
          ventes pour la pharmacie, les flux du dépôt pour la réserve.
          2.7.21 — l'ADMINISTRATEUR voit LES DEUX : ventes du comptoir ET
          entrées/sorties de la réserve (les choses importantes du dépôt). */}
      {!estDepot
        ? <div style={{ marginBottom: 16 }}><SalesHistogram /></div>
        : <div style={{ marginBottom: 16 }}><DepotFlowChart /></div>}
      {estAdmin ? <div style={{ marginBottom: 16 }}><DepotFlowChart /></div> : null}

      <div className="grid grid--2">
        {/* 2.7.28 — le dépôt voit aussi les alertes « bientôt épuisé » du
            comptoir (pharmacie) : la carte s'appelle donc « pharmacie + dépôt ». */}
        <Card title={estDepot ? 'Alertes de stock (dépôt + comptoir)' : 'Alertes de stock (pharmacie)'}
          actions={<Badge tone={rouges.length ? 'danger' : alerts.length ? 'warn' : 'ok'}>
            {alerts.length ? `${alerts.length} alerte(s)` : 'aucune'}
          </Badge>}>
          {alerts.length === 0 ? <Empty>Aucune alerte : tout est sous contrôle.</Empty> : (
            <div>
              {alerts.slice(0, 12).map(alert => (
                <div className="list-row" key={alert.id}>
                  <AlertTriangle size={18} color={alert.level === 'red' ? '#b91c1c' : '#b45309'} />
                  <div className="list-row__main">
                    <strong>{libelle(alert)}</strong>
                    <div className="muted" style={{ fontSize: '.82rem' }}>{alert.detail}</div>
                  </div>
                  <Btn variant="ghost" icon={ArrowRight} onClick={() => navigate(alert.target || 'lots')}>
                    {action(alert.target)}
                  </Btn>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="stack">
          <Card title="Prochaines péremptions">
            {proches.length === 0 ? <Empty>Aucun lot daté en stock.</Empty> : (
              <div className="table-scroll">
                <table className="data">
                  <thead><tr><th>Médicament</th><th>Lot</th><th className="num">Qté</th><th>Expiration</th></tr></thead>
                  <tbody>
                    {proches.map(lot => (
                      <tr key={lot.id}>
                        <td className="wrap">{products.find(product => product.id === lot.productId)?.name || '—'}</td>
                        <td>{lot.number}</td>
                        <td className="num">{integer(lot.quantity)}</td>
                        <td>{expiryLabel(lot.expiresOn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* 2.7.20 — la carte récapitulative des derniers transferts est
              RETIRÉE aussi côté dépôt : l'historique vit dans le menu
              « Historique de transfert », et le suivi J/J dans le nouveau menu
              « Calendrier des stock ». */}
        </div>
      </div>
    </div>
  );
}