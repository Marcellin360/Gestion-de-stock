// ============================================================================
// 2.7.36 — MENU « Historique de vente » (placé juste sous Vente, demande du
// comptoir), séparé en DEUX onglets :
//
//   1. « Clients tsotra (passage) » : toutes les ventes SANS carnet — c'est
//      l'écran qu'ouvrait le bouton « Historique de vente » de la caisse,
//      avec ses filtres (dates, état, recherche), son détail ligne par ligne
//      et l'annulation motivée.
//   2. « Clients hôpital (patients) » : UN LIGNE PAR PATIENT ayant pris des
//      médicaments à la pharmacie — mombamoba ny marary (nom, service, date
//      d'admission), le(s) docteur(s) qui l'ont reçu, nombre et dates des
//      délivrances. Un « Détail » par patient montre TOUTE l'hospitalisation :
//      achats DANS L'ORDRE (le même patient continue jour après jour),
//      médicaments cumulés, et le bouton « Télécharger l'ORDONNANCE DE SÉJOUR
//      (PDF) » — UNE seule ordonnance par séjour.
//
//   Les DEUX onglets ont chacun leur RECHERCHE (fanaovana recherche).
//
// 2.7.65 — « Ordonnance de séjour » n'ouvre PLUS une fenêtre d'impression :
//   comme les boutons de la page Vente (2.7.57), elle TÉLÉCHARGE le PDF dès
//   le clic (route `?fmt=pdf` — `?du/au` conservée s'ils sont choisis), avec
//   le contournement « navigateur » (2.7.63) quand la protection web locale
//   vide la réponse, et le toast WARN d'explication.
//
// 2.7.66/67 — finitions ergonomiques (fanatsarana interface) :
//   · onglet HÔPITAL : la fenêtre « entre deux dates » a SA PROPRE SECTION
//     au-dessus de la liste — « Du » tout à GAUCHE, « Au » tout à DROITE ;
//   · colonne « Action » CENTRÉE (2.7.67) au-dessus de « Détail » (BLEU,
//     entièrement coloré) et « Ordonnance de séjour (PDF) », avec un petit
//     espace régulier entre les boutons ;
//   · dans le DÉTAIL d'un séjour (2.7.67) : les dates « entre deux dates »
//     occupent toute la largeur du pied — « Du » à GAUCHE, « Au » à DROITE —
//     et le bouton « Fermer » est ROUGE, LE DERNIER EN BAS ;
//   · onglets toujours LISIBLES (« mazava », jamais « manjavona »).
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { FileDown, Search } from 'lucide-react';
import { hopital } from '../api/endpoints.js';
import { downloadPdf } from '../api/client.js';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, Table, Tabs } from '../components/ui.jsx';
import SaleHistoryModal, { COULEUR_DETAIL, MESSAGE_PDF_NAVIGATEUR } from '../components/SaleHistoryModal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { dateTime, integer, money } from '../utils/format.js';
// 2.7.84 — unités de vente libres (chaîne de conditionnement) : ml, cm…
import { libelleQuantiteUnite } from '../utils/unites.js';

const ROLE_LABEL = code => (code === 'DOCTOR' ? 'Médecin' : code === 'MIDWIFE' ? 'Sage-femme' : code || '—');
const dateFr = valeur => (valeur ? String(valeur).slice(0, 10).split('-').reverse().join('/') : '—');
/** 2.7.65 — ajoute `fmt=pdf` proprement (selon qu'une query existe ou pas). */
const cheminPdf = chemin => `${chemin}${chemin.includes('?') ? '&' : '?'}fmt=pdf`;

export default function HistoriqueVentesPage() {
  const [onglet, setOnglet] = useState('tsotra');

  return (
    <div className="stack">
      <Tabs
        items={[
          { value: 'tsotra', label: 'Clients tsotra (passage)' },
          { value: 'hopital', label: 'Clients hôpital (patients)' }
        ]}
        value={onglet} onChange={setOnglet}
      />
      {onglet === 'tsotra' ? (
        // L'écran historique de la caisse réutilisé TEL QUEL, sans que ses
        // carnets n'y figurent (tsotraOnly) : filtre dates, recherche, détail
        // ligne par ligne, annulation motivée — tout est conservé.
        <SaleHistoryModal inline tsotraOnly />
      ) : (
        <OngletHopital />
      )}
    </div>
  );
}

/** Onglet « Clients hôpital » : un patient = une ligne (recherche + du/au). */
function OngletHopital() {
  const [sejours, setSejours] = useState(null);
  const [error, setError] = useState(null);
  const [recherche, setRecherche] = useState('');
  // 2.7.37 — teboka ⑤ : la fenêtre « entre deux dates » filtre la liste ET se
  // transmet à l'ordonnance de séjour (boutons + modale du/au).
  const [fenetre, setFenetre] = useState({ du: '', au: '' });
  const [detail, setDetail] = useState(null); // patientId
  const toast = useToast();

  const charger = async () => {
    try {
      setSejours(await hopital.sejours());
    } catch (cause) { setError(cause); }
  };
  useEffect(() => { charger(); }, []);

  // 2.7.65 — tout clic « ordonnance » TÉLÉCHARGE le PDF (fallback navigateur
  // + erreur en toast, exactement comme la page Vente).
  const telechargerPdf = (chemin, nomFichier) => downloadPdf(chemin, nomFichier)
    .then(result => {
      if (result?.via === 'navigateur') toast.warn(MESSAGE_PDF_NAVIGATEUR);
    })
    .catch(cause => toast.error(cause.message || 'Téléchargement du PDF impossible.'));

  const affiches = useMemo(() => {
    let liste = sejours || [];
    if (fenetre.du || fenetre.au) {
      liste = liste.filter(ligne => {
        const debut = String(ligne.firstSaleAt || '').slice(0, 10);
        const fin = String(ligne.lastSaleAt || '').slice(0, 10);
        // Le séjour CHEVAUCHE la fenêtre demandée (il n'est ni terminé avant,
        // ni commencé après).
        return (!fenetre.du || !fin || fin >= fenetre.du) && (!fenetre.au || !debut || debut <= fenetre.au);
      });
    }
    const needle = recherche.trim().toLowerCase();
    if (!needle) return liste;
    return liste.filter(ligne => [ligne.patient, ligne.service, ...ligne.prescribers.map(p => p.name)]
      .join(' ').toLowerCase().includes(needle));
  }, [sejours, recherche, fenetre]);

  /** URL de l'ordonnance de séjour, fenêtres du/au transmises au serveur. */
  const urlOrdonnance = id => {
    const query = new URLSearchParams();
    if (fenetre.du) query.set('du', fenetre.du);
    if (fenetre.au) query.set('au', fenetre.au);
    const suffixe = query.toString();
    return `/patients/${id}/ordonnance${suffixe ? `?${suffixe}` : ''}`;
  };

  return (
    <>
      {/* 2.7.66 — SECTION À PART pour « entre deux dates » : « Du » tout à
          GAUCHE, « Au » tout à DROITE, au-dessus de la liste des patients
          (elle ne se mélange plus ni à la recherche ni aux lignes). */}
      <Card title="Recherche entre deux dates (fenêtre du séjour)">
        <div className="sejour-fenetre">
          <Field label="Du (début de la fenêtre)">
            <Input type="date" value={fenetre.du} max={fenetre.au || undefined}
              onChange={e => setFenetre({ ...fenetre, du: e.target.value })} aria-label="Du (début de la fenêtre)" />
          </Field>
          <div className="sejour-fenetre__milieu">
            {(fenetre.du || fenetre.au) ? (
              <Btn variant="ghost" onClick={() => setFenetre({ du: '', au: '' })}>Effacer — tout le séjour</Btn>
            ) : (
              <span className="muted">Filtre la liste et s’applique aussi à l’ordonnance de séjour.</span>
            )}
          </div>
          <Field label="Au (fin de la fenêtre)" className="sejour-fenetre__droite">
            <Input type="date" value={fenetre.au} min={fenetre.du || undefined}
              onChange={e => setFenetre({ ...fenetre, au: e.target.value })} aria-label="Au (fin de la fenêtre)" />
          </Field>
        </div>
      </Card>

      <Card title={`${affiches.length} patient(s)`}
        actions={
          // La RECHERCHE reste dans l'en-tête de la liste : elle regarde les
          // lignes qu'elle filtre (ergonomie : action proche de son effet).
          <div className="row row--tight" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Search size={14} className="muted" />
            <Input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Recherche : patient, service, docteur…" style={{ width: 280 }}
              aria-label="Recherche d'un patient hospitalisé" />
          </div>
        }>
        {error ? <ErrorBox error={error} /> : null}
        {sejours === null ? <Spinner page /> : affiches.length === 0 ? (
          <Empty>
            Aucun client hospital n’apparaît : {recherche
              ? 'aucun patient ne répond à cette recherche.'
              : 'les ventes « Carnet hôpital » (écran Vente) rempliront cette liste.'}
          </Empty>
        ) : (
          <Table columns={[
            { label: 'Patient' }, { label: 'Service' }, { label: 'Date d’admission' },
            { label: 'Prescrit par' }, { label: 'Carnets' }, { label: 'Dernière délivrance' },
            { label: 'Action', center: true }
          ]}>
            {affiches.map(ligne => (
              <tr key={ligne.patientId}>
                <td><strong>{ligne.patient}</strong></td>
                <td>{ligne.service || '—'}</td>
                <td>{dateFr(ligne.admittedOn)}</td>
                <td className="wrap">
                  {ligne.prescribers.length
                    ? ligne.prescribers.map(p => (
                      <Badge key={p.id} tone="info" style={{ marginRight: 4 }}>
                        {p.name} ({ROLE_LABEL(p.role)})
                      </Badge>
                    ))
                    : '—'}
                </td>
                <td>{integer(ligne.saleCount)}</td>
                <td>{dateTime(ligne.lastSaleAt)}</td>
                <td className="center nowrap">
                  {/* 2.7.67 — boutons ENTIÈREMENT colorés (fond plein + texte
                      blanc), avec un petit espace régulier entre eux. */}
                  <div className="actes">
                    <Btn size="sm" variant="ghost" style={COULEUR_DETAIL} onClick={() => setDetail(ligne.patientId)}>Détail</Btn>
                    {/* 2.7.65 — téléchargement PDF direct au clic (plus de fenêtre). */}
                    <Btn size="sm" variant="primary" icon={FileDown}
                      onClick={() => telechargerPdf(cheminPdf(urlOrdonnance(ligne.patientId)), `ordonnance-sejour-${ligne.patientId}.pdf`)}>
                      Ordonnance de séjour (PDF)
                    </Btn>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {detail ? <ModalSejour patientId={detail} onClose={async () => { setDetail(null); await charger(); }} /> : null}
    </>
  );
}

/** Détail COMPLET du séjour d'un patient : achats dans l'ordre + cumul. */
function ModalSejour({ patientId, onClose }) {
  const [donnees, setDonnees] = useState(null);
  const [error, setError] = useState(null);
  // 2.7.82 — DEMANDE OFFICINE : les champs « Du / Au » (entre deux dates) sont
  // RETIRÉS du pied de cette fenêtre ; l'ordonnance de séjour = le séjour
  // ENTIER (le filtre « entre deux dates » de la PAGE, au-dessus de la liste,
  // reste disponible). L'ordonnance « par jour » (2.7.79) suffit au resserrement.
  // 2.7.79 — ORDONNANCE PAR JOUR : en plus de l'ordonnance CUMULÉE (existante),
  // un menu déroulant liste les jours où le patient a effectivement acheté ;
  // l'ordonnance d'UN jour ne mélange jamais avec les autres jours (du = au).
  const [jourSel, setJourSel] = useState('');
  const toast = useToast();
  useEffect(() => {
    hopital.sejour(patientId).then(setDonnees).catch(setError);
  }, [patientId]);

  // 2.7.65 — même téléchargement PDF (fallback navigateur + toast) ici aussi.
  const telechargerPdf = (chemin, nomFichier) => downloadPdf(chemin, nomFichier)
    .then(result => {
      if (result?.via === 'navigateur') toast.warn(MESSAGE_PDF_NAVIGATEUR);
    })
    .catch(cause => toast.error(cause.message || 'Téléchargement du PDF impossible.'));

  // 2.7.84 — l'unité vendue peut être n'importe quelle unité de la chaîne
  // (« plaquette », « comprimé », « ml », « cm »…) ; codes legacy compris.
  const plural = (unite, nombre) => libelleQuantiteUnite(unite || 'BOX', nombre);

  // 2.7.82 — ordonnance de séjour = TOUJOURS le séjour complet (la fenêtre
  // « Du/Au » au pied de cette fenêtre est retirée sur demande de l'officine).
  const urlOrdonnance = () => `/patients/${patientId}/ordonnance`;

  // 2.7.79 — jours où le patient a REÇU des médicaments (un groupe d'achats),
  // triés du plus récent au plus ancien ; '' = « aujourd'hui n'a encore rien ».
  const joursAchats = donnees
    ? [...new Set(donnees.ventes.map(v => String(v.date).slice(0, 10)))].sort().reverse()
    : [];
  /** URL de l'ordonnance d'UN seul jour (du = au = le jour choisi) : les achats
      des autres jours n'entrent jamais dans cette ordonnance. */
  const urlOrdonnanceJour = jour =>
    `/patients/${patientId}/ordonnance?du=${jour}&au=${jour}`;

  return (
    <Modal wide onClose={onClose}
      title={donnees ? `Séjour de ${donnees.patient.name}` : 'Séjour du patient'}
      footer={<>
        {/* 2.7.82 — champs « Du / Au » RETIRÉS (demande officine) : le pied ne
            garde que l'ordonnance du jour + l'ordonnance du séjour complet. */}
        {/* 2.7.79 — ORDONNANCE DU JOUR : la liste des jours où le patient a
            acheté ; choisir un jour → télécharger SON ordonnance seulement
            (sans mélanger avec les achats d'un autre jour). */}
        {joursAchats.length ? (
          <span className="row row--tight" style={{ alignItems: 'center', flex: '1 1 100%', justifyContent: 'flex-start' }}>
            <strong style={{ fontSize: '.85rem' }}>Jour</strong>
            <Select value={jourSel} onChange={e => setJourSel(e.target.value)}
              style={{ width: 150 }}
              aria-label="Jour de l’ordonnance (achats de ce jour seulement)">
              <option value="">— choisir un jour —</option>
              {joursAchats.map(jour => (
                <option key={jour} value={jour}>{dateFr(jour)}</option>
              ))}
            </Select>
            <Btn variant="ghost" icon={FileDown} disabled={!jourSel}
              title="Ordonnance des achats du jour choisi seulement (les autres jours n'entrent pas)"
              onClick={() => telechargerPdf(cheminPdf(urlOrdonnanceJour(jourSel)), `ordonnance-jour-${patientId}-${jourSel}.pdf`)}>
              Ordonnance du jour (PDF)
            </Btn>
          </span>
        ) : null}
        {/* UNE ordonnance par hospitalisation : médicaments cumulés du séjour
            ENTIER (2.7.82 — la fenêtre « du … au … » du pied est retirée).
            2.7.65 — TÉLÉCHARGER en PDF d'un clic (plus de fenêtre d'impression).
            2.7.79 — l'ordonnance CUMULÉE est CONSERVÉE telle quelle ; la
            nouveauté est l'ordonnance PAR JOUR ci-dessus. */}
        <Btn variant="primary" icon={FileDown}
          onClick={() => telechargerPdf(cheminPdf(urlOrdonnance()), `ordonnance-sejour-${patientId}.pdf`)}>
          Télécharger l’ordonnance de séjour (PDF)
        </Btn>
        {/* 2.7.67 — « Fermer » ROUGE, LE DERNIER BOUTON (tout en bas à droite). */}
        <Btn variant="danger" onClick={onClose}>Fermer</Btn>
      </>}>
      {error ? <ErrorBox error={error} /> : null}
      {donnees === null && !error ? <Spinner page /> : null}
      {donnees ? (
        <div className="stack">
          <div className="grid grid--2">
            <dl className="kv">
              <dt>Patient</dt><dd><strong>{donnees.patient.name}</strong></dd>
              <dt>Service</dt><dd>{donnees.patient.service || '—'}</dd>
              {/* 2.7.79 — la raison d'hospitalisation (fiche patient) repasse
                  dans la fiche de séjour. */}
              <dt>Motif d’hospitalisation</dt><dd>{donnees.patient.motif || '—'}</dd>
              <dt>Admis à l’hôpital le</dt><dd>{dateFr(donnees.patient.admittedOn)}</dd>
              <dt>État</dt><dd>{donnees.patient.active ? 'en service' : 'sorti de l’hôpital'}</dd>
            </dl>
            <dl className="kv">
              <dt>Enregistré par</dt><dd>{donnees.patient.createdByName || '—'}</dd>
              <dt>Prescrit par</dt><dd>
                {donnees.prescribers.length
                  ? donnees.prescribers.map(p => `${p.name}${p.role ? ` (${ROLE_LABEL(p.role)})` : ''}`).join(', ')
                  : '—'}
              </dd>
              <dt>Carnets du séjour</dt><dd>{integer(donnees.ventes.length)}</dd>
            </dl>
          </div>

          <h3>Médicaments pris pendant le séjour — cumul (ce que porte l’ordonnance)</h3>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr><th>Médicament</th><th className="num">Quantité totale sur le séjour</th></tr>
              </thead>
              <tbody>
                {donnees.medecines.map((ligne, index) => (
                  <tr key={index}>
                    <td className="wrap"><strong>{ligne.product}</strong></td>
                    <td className="num">{ligne.saleQuantity} {plural(ligne.saleUnit, Number(ligne.saleQuantity))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Achats du séjour — dans l’ordre (le même patient continue jour après jour)</h3>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th><th>Référence</th><th>Prescrit par</th>
                  <th>Médicaments du carnet</th><th className="num">Montant (interne)</th>
                </tr>
              </thead>
              <tbody>
                {donnees.ventes.map(vente => (
                  <tr key={vente.saleId}>
                    <td>{vente.date ? dateTime(vente.date) : '—'}</td>
                    <td>{vente.reference}</td>
                    <td>{vente.prescriber || '—'}{vente.prescriberRole ? <Badge tone="info" style={{ marginLeft: 6 }}>{ROLE_LABEL(vente.prescriberRole)}</Badge> : null}</td>
                    <td className="wrap">
                      {vente.lignes.map((ligne, index) => (
                        <div key={index}>
                          {ligne.product} — <strong>{ligne.saleQuantity ?? ligne.quantity}</strong>{' '}
                          {plural(ligne.saleUnit, Number(ligne.saleQuantity ?? ligne.quantity))}
                        </div>
                      ))}
                    </td>
                    <td className="num">{money(vente.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: '.8rem' }}>
            Rappel : l’ordonnance remise au patient N’AFFICHE AUCUN MONTANT — la colonne
            « Montant » ci-dessus reste un outillage interne de la pharmacie.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}