// 2.7.11 — « Historique de vente » : s'ouvre depuis le bouton en haut de
// l'écran Vente. TOUTES les ventes de la pharmacie sont listées avec leurs
// détails : référence, date, client, montant, marge, état — et pour chacune,
// en un clic, les lignes vendues (médicament, lot, quantité, prix unitaire,
// valeur), le coût retenu, l'utilisateur et les mouvements de stock remis en
// place en cas d'annulation. L'annulation motivée (permission « cancel ») vit
// ici depuis le retrait du menu Documents (écran toujours joignable par
// #/documents).
// Le serveur calcule tout ; l'écran affiche (RG04) : components champs
// total / costTotal / margin / lines / movements fournis par
// GET /api/documents  et  GET /api/documents/SALE/:id.
//
// 2.7.65 — dans l'HISTORIQUE, le bouton « imprimer » n'ouvre PLUS une
//   fenêtre : comme sur la page Vente (2.7.57), le document est TOUJOURS
//   TÉLÉCHARGÉ en PDF dès le clic (`?fmt=pdf`), avec le même contournement
//   « navigateur » (2.7.63) quand la protection web locale vide la réponse.
//
// 2.7.66/67 — finitions ergonomiques : colonne « Action » CENTRÉE ; boutons
//   ENTIÈREMENT COLORÉS (Détail = BLEU, imprimer/télécharger = VERT,
//   annuler = ROUGE) ; petit espace régulier entre eux (.actes).
//
// 2.7.68 — L'ONGLET « CLIENTS TSOTRA » PREND LA MÊME FORME que l'onglet
//   « Clients hôpital » (demande du comptoir) :
//   · CARTE 1 « Recherche entre deux dates (période des ventes) » : « Du »
//     tout à GAUCHE, « Au » tout à DROITE, boutons de période rapide au
//     milieu (même gabarit .sejour-fenetre que l'hôpital) ;
//   · CARTE 2 « N vente(s) affichée(s) » : État + RECHERCHE dans son
//     en-tête à droite ; à l'intérieur, les badges d'encaissement puis la
//     LISTE des ventes (section .liste-ventes, tableaux inchangés).
import { useMemo, useState } from 'react';
import { Ban, ClipboardList, Eye, Printer, Search, ShoppingCart } from 'lucide-react';
import { documents as documentsApi } from '../api/endpoints.js';
import { downloadPdf } from '../api/client.js';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Input, Modal, Select, StatusBadge, Textarea } from './ui.jsx';
import { dateTime, integer, money, today, addDays } from '../utils/format.js';
// 2.7.84 — unités de vente libres (chaîne de conditionnement) : ml, cm…
import { libelleQuantiteUnite } from '../utils/unites.js';

const STATUS_LABELS = { VALIDATED: 'Validée', CANCELLED: 'Annulée', DRAFT: 'En cours', ABANDONED: 'Abandonnée' };
// 2.7.12 — vente au détail : affiche la quantité DANS L'UNITÉ vendue.
// 2.7.84 — l'unité vendue peut être n'importe quelle unité de la chaîne de
// conditionnement (« plaquette », « comprimé », « ml », « cm »…) : le pluriel
// passe par l'utilitaire partagé (utils/unites.js) ; les codes historiques
// BOX / BLISTER / UNIT des ventes passées gardent leurs libellés.
const UNITE_LABELS = { BOX: 'boîte', BLISTER: 'plaquette', UNIT: 'comprimé' };
const quantiteVendue = line => {
  const nombre = Number(line.saleQuantity ?? line.quantity);
  return `${Number.isInteger(nombre) ? integer(nombre) : nombre.toLocaleString('fr-FR')} `
    + libelleQuantiteUnite(line.saleUnit || 'BOX', nombre);
};
// 2.7.65 — message du contournement navigateur (protection web locale).
export const MESSAGE_PDF_NAVIGATEUR = 'Téléchargement lancé par le NAVIGATEUR (la protection web locale bloquait le fetch) : '
  + 'vérifiez votre dossier « Téléchargements ». Si le fichier n’y figure pas, '
  + 'ajoutez ce site aux exclusions de l’antivirus.';

// 2.7.67 — code couleur ergonomique des actions, boutons ENTIÈREMENT
// COLORÉS (« miloko aby ») : fond plein + texte blanc + bordure assortie —
// Détail = BLEU, imprimer/télécharger = VERT, annuler = ROUGE.
export const COULEUR_DETAIL = { background: '#1d4ed8', borderColor: '#1d4ed8', color: '#fff' };
export const COULEUR_IMPRIMER = { background: '#15803d', borderColor: '#15803d', color: '#fff' };
export const COULEUR_ANNULER = { background: '#b91c1c', borderColor: '#b91c1c', color: '#fff' };
/** Boutons PLEINS (pied de la modale de détail) : même code couleur. */
export const PLEIN_IMPRIMER = { background: '#15803d', borderColor: '#15803d', color: '#fff' };
export const PLEIN_ORDONNANCE = { background: '#0f766e', borderColor: '#0f766e', color: '#fff' };

export default function SaleHistoryModal({ onClose, inline = false, tsotraOnly = false }) {
  const { documents, productName, lotNumber, refresh } = useData();
  const { can } = useAuth();
  const toast = useToast();
  // 2.7.33 — teboka ⑭ : les ventes se filtrent ENTRE DEUX DATES (« Du … au … »),
  // en plus du texte et de l'état. Laisser vide = pas de borne.
  const [filtres, setFiltres] = useState({ du: '', au: '', terme: '', statut: '' });
  const [detail, setDetail] = useState(null);
  const [annulation, setAnnulation] = useState(null);
  const [motif, setMotif] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // 2.7.65 — tout « imprimer » de cet écran TÉLÉCHARGE le PDF (même
  // comportement que la page Vente : fallback « navigateur » + erreur claire).
  const telechargerPdf = (chemin, nomFichier) => downloadPdf(chemin, nomFichier)
    .then(result => {
      if (result?.via === 'navigateur') toast.warn(MESSAGE_PDF_NAVIGATEUR);
    })
    .catch(cause => toast.error(cause.message || 'Téléchargement du PDF impossible.'));

  // Ventes de la pharmacie, les plus récentes d'abord (la liste « documents »
  // est déjà triée par le serveur : on conserve cet ordre).
  const ventes = useMemo(() => (documents || [])
    .filter(doc => doc.kind === 'SALE')
    // 2.7.36 — onglet « Clients tsotra » du menu Historique de vente : on
    // n'y montre que les ventes de PASSAGE (ni patient ni prescripteur).
    .filter(doc => (tsotraOnly ? !doc.patientId && !doc.medicalStaffId : true))
    .filter(doc => (filtres.du ? String(doc.date).slice(0, 10) >= filtres.du : true))
    .filter(doc => (filtres.au ? String(doc.date).slice(0, 10) <= filtres.au : true))
    .filter(doc => (filtres.statut ? doc.status === filtres.statut : true))
    .filter(doc => {
      if (!filtres.terme) return true;
      const haystack = [doc.reference, doc.customerName, doc.note].join(' ').toLowerCase();
      return haystack.includes(filtres.terme.toLowerCase());
    }), [documents, filtres]);

  // Totaux d'encaissement sur la sélection affichée (détails visibles d'office).
  const valides = ventes.filter(doc => doc.status === 'VALIDATED');
  const totalEncaisse = valides.reduce((total, doc) => total + Number(doc.total || 0), 0);
  const margeTotale = valides.reduce((total, doc) => total + Number(doc.margin || 0), 0);

  const ouvrir = async doc => {
    setError(null);
    try {
      setDetail(await documentsApi.detail('SALE', doc.id));
    } catch (cause) {
      setError(cause);
    }
  };

  const annuler = async () => {
    setBusy(true);
    setError(null);
    try {
      const reponse = await documentsApi.cancel('SALE', annulation.id, motif);
      toast.success(`Vente ${reponse.reference || ''} annulée — stock remis en place, trace conservée.`);
      setAnnulation(null);
      setMotif('');
      setDetail(null);
      await refresh();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {(() => {
        const contenu = (
          <>
        {/* ----- 2.7.68 · CARTE 1 : « entre deux dates » (forme hôpital) ----
            « Du » à GAUCHE, « Au » à DROITE, périodes rapides au milieu —
            même gabarit .sejour-fenetre que l'onglet « Clients hôpital ». */}
        <Card title="Recherche entre deux dates (période des ventes)">
          <div className="sejour-fenetre">
            <Field label="Du (début de la période)">
              <Input type="date" value={filtres.du} max={filtres.au || today()}
                onChange={e => setFiltres({ ...filtres, du: e.target.value })}
                aria-label="Du (début de la période)" />
            </Field>
            <div className="sejour-fenetre__milieu">
              <Btn size="sm" variant="ghost" onClick={() => setFiltres({ ...filtres, du: today(), au: today() })}>Aujourd’hui</Btn>
              <Btn size="sm" variant="ghost" onClick={() => setFiltres({ ...filtres, du: addDays(-7), au: today() })}>7 derniers jours</Btn>
              <Btn size="sm" variant="ghost" onClick={() => setFiltres({ ...filtres, du: addDays(-30), au: today() })}>30 derniers jours</Btn>
              <Btn size="sm" variant="ghost" onClick={() => setFiltres({ ...filtres, du: '', au: '' })}>Tout</Btn>
              {(filtres.du || filtres.au) ? (
                <span className="muted">
                  Période : {filtres.du ? `du ${filtres.du.split('-').reverse().join('/')}` : 'depuis le début'}{' '}
                  {filtres.au ? `au ${filtres.au.split('-').reverse().join('/')}` : "jusqu’à aujourd’hui"}.
                </span>
              ) : (
                <span className="muted">Filtre la liste au-dessous (laisser vide = sans borne).</span>
              )}
            </div>
            <Field label="Au (fin de la période)" className="sejour-fenetre__droite">
              <Input type="date" value={filtres.au} min={filtres.du || undefined} max={today()}
                onChange={e => setFiltres({ ...filtres, au: e.target.value })}
                aria-label="Au (fin de la période)" />
            </Field>
          </div>
        </Card>

        {/* ----- 2.7.68 · CARTE 2 : la LISTE des ventes (forme hôpital) -----
            État + recherche dans l'en-tête à droite ; badges d'encaissement
            et tableaux à l'intérieur. */}
        <Card title={`${ventes.length} vente(s) affichée(s)`}
          actions={
            <div className="row row--tight" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Select value={filtres.statut} onChange={e => setFiltres({ ...filtres, statut: e.target.value })}
                style={{ width: 140 }} aria-label="État des ventes" title="Filtrer par état">
                <option value="">Toutes</option>
                {Object.entries(STATUS_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </Select>
              {/* 2.7.67/68 — la RECHERCHE se cale à DROITE de la carte
                  (espace avant elle déjà fourni par l'en-tête). */}
              <Search size={14} className="muted" />
              <Input className="tsotra-recherche" value={filtres.terme}
                onChange={e => setFiltres({ ...filtres, terme: e.target.value })}
                placeholder="Recherche : référence, client…" style={{ width: 250 }}
                aria-label="Recherche dans l’historique de vente" />
            </div>
          }>
          {/* Synthèse de la sélection : lisible sans ouvrir chaque vente. */}
          <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
            <Badge tone="ok">Encaissé (validées) : {money(totalEncaisse)}</Badge>
            {/* 2.7.37 — teboka ⑤ : la marge ne se montre plus dans l'onglet
                « clients tsotra » (ni en colonne, ni en badge). */}
            {!tsotraOnly && can(['prices', 'costs']) ? <Badge tone="default">Marge brute (validées) : {money(margeTotale)}</Badge> : null}
          </div>

          {error ? <div style={{ marginBottom: 10 }}><ErrorBox error={error} /></div> : null}

          {ventes.length === 0 ? (
            <Empty>
              <ShoppingCart size={22} /> Aucune vente ne correspond à ces critères :
              modifiez la période ou la recherche.
            </Empty>
          ) : (
            /* 2.7.67 — la LISTE des ventes est une section titrée à part
               (dans sa carte 2.7.68). */
            <section className="liste-ventes">
              <h3>
                {tsotraOnly
                  ? 'Liste de l’historique de vente — une ligne par médicament vendu'
                  : 'Liste de l’historique de vente — un carnet par ligne'}
              </h3>
            {tsotraOnly ? (
            /* 2.7.37 — teboka ⑤ « clients tsotra » : UNE LIGNE PAR MÉDICAMENT
               vendu — « Médicament » remplace « Référence », avec QUANTITÉ et
               PRIX UNITAIRE ; la MARGE n'y figure plus nulle part.
               2.7.66/67 — colonne « Action » CENTRÉE, boutons colorés pleins,
               espace régulier entre eux. */
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Médicament</th>
                    <th className="num">Quantité</th>
                    <th className="num">Prix unitaire</th>
                    <th className="num">Montant</th>
                    <th>Client</th>
                    <th>État</th>
                    <th className="center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {ventes.flatMap(doc =>
                    (doc.lines?.length ? doc.lines : [null]).map((ligne, index) => (
                      <tr key={`${doc.id}-${index}`}>
                        <td className="nowrap">{dateTime(doc.date)}</td>
                        <td className="wrap">
                          {ligne ? <strong>{productName(ligne.productId)}</strong> : <span className="muted">—</span>}
                        </td>
                        <td className="num">{ligne ? quantiteVendue(ligne) : '—'}</td>
                        <td className="num">{ligne ? money(ligne.unitPrice) : '—'}</td>
                        <td className="num">
                          {ligne ? money(Number(ligne.saleQuantity ?? ligne.quantity) * Number(ligne.unitPrice || 0)) : money(doc.total)}
                        </td>
                        <td className="wrap">{doc.customerName || 'Client de passage'}</td>
                        <td><StatusBadge status={doc.status} labels={STATUS_LABELS} /></td>
                        {index === 0 ? (
                          <td className="center nowrap">
                            {/* 2.7.67 — boutons ENTIÈREMENT colorés (fond plein +
                                texte blanc) et espace régulier entre eux. */}
                            <div className="actes">
                              <Btn variant="ghost" icon={Eye} style={COULEUR_DETAIL} onClick={() => ouvrir(doc)} aria-label="Détail">Détail</Btn>
                              {/* 2.7.65 — l'icone « imprimer » TÉLÉCHARGE le PDF
                                  directement (au lieu d'ouvrir une fenêtre). */}
                              <Btn variant="ghost" icon={Printer} style={COULEUR_IMPRIMER}
                                onClick={() => telechargerPdf(`/documents/SALE/${doc.id}/print?fmt=pdf`, `ticket-${doc.reference}.pdf`)}
                                aria-label="Télécharger le ticket (PDF)" />
                              {can('cancel') && doc.status === 'VALIDATED' ? (
                                <Btn variant="ghost" icon={Ban} style={COULEUR_ANNULER} onClick={() => setAnnulation(doc)} aria-label="Annuler" />
                              ) : null}
                            </div>
                          </td>
                        ) : <td className="right" />}
                      </tr>
                    )))}
                </tbody>
              </table>
            </div>
            ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Date</th>
                    <th>Client</th>
                    <th className="num">Montant</th>
                    {can(['prices', 'costs']) ? <th className="num">Marge</th> : null}
                    <th>État</th>
                    <th className="center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {ventes.map(doc => (
                    <tr key={doc.id}>
                      <td><strong>{doc.reference}</strong></td>
                      <td>{dateTime(doc.date)}</td>
                      <td className="wrap">{doc.customerName || 'Client de passage'}</td>
                      <td className="num">{money(doc.total)}</td>
                      {can(['prices', 'costs']) ? <td className="num">{money(doc.margin)}</td> : null}
                      <td><StatusBadge status={doc.status} labels={STATUS_LABELS} /></td>
                      <td className="center nowrap">
                        <div className="actes">
                          <Btn variant="ghost" icon={Eye} style={COULEUR_DETAIL} onClick={() => ouvrir(doc)} aria-label="Détail">Détail</Btn>
                          {/* 2.7.65 — téléchargement PDF direct. */}
                          <Btn variant="ghost" icon={Printer} style={COULEUR_IMPRIMER}
                            onClick={() => telechargerPdf(`/documents/SALE/${doc.id}/print?fmt=pdf`, `ticket-${doc.reference}.pdf`)}
                            aria-label="Télécharger le ticket (PDF)" />
                          {/* 2.7.35 — vente sur carnet : l'ordonnance (sans montants)
                              s'obtient aussi directement depuis la liste — 2.7.65 :
                              téléchargée en PDF, jamais ouverte dans une fenêtre. */}
                          {(doc.patientId || doc.medicalStaffId) ? (
                            <Btn variant="ghost" icon={ClipboardList} style={COULEUR_IMPRIMER}
                              onClick={() => telechargerPdf(`/sales/${doc.id}/ordonnance?fmt=pdf`, `ordonnance-${doc.reference}.pdf`)}
                              aria-label="Télécharger l’ordonnance (PDF)" />
                          ) : null}
                          {can('cancel') && doc.status === 'VALIDATED' ? (
                            <Btn variant="ghost" icon={Ban} style={COULEUR_ANNULER} onClick={() => setAnnulation(doc)} aria-label="Annuler" />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
            </section>
          )}

          {!tsotraOnly ? (
          <p className="muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
            « Détail » montre chaque médicament vendu : lot sorti, quantité, prix unitaire et valeur.
            L’annulation remet le stock en place et reste inscrite au journal : rien ne s’efface.
          </p>
          ) : null}
        </Card>
</>
        );
        // 2.7.36 — le même écran sert DANS une modale (bouton de la
        // caisse) et EN PAGE (onglet « Clients tsotra » du menu
        // Historique de vente) : inline = pas de modèle de présentation.
        return inline ? <div className="stack">{contenu}</div> : (
        <Modal title="Historique de vente — détail de chaque vente" onClose={onClose} wide
          footer={<Btn variant="primary" onClick={onClose}>Fermer</Btn>}>{contenu}</Modal>
        );
      })()}

      {/* --------------------------- Détail d'une vente ---------------------- */}
      {detail ? (
        <Modal title={`Vente ${detail.reference}`} onClose={() => setDetail(null)} wide
          footer={<>
            <Btn variant="ghost" onClick={() => setDetail(null)}>Retour à la liste</Btn>
            {/* 2.7.65 — depuis le détail aussi : téléchargement direct.
                2.7.66/67 — même code couleur : imprimer/télécharger = VERT. */}
            <Btn icon={Printer} style={PLEIN_IMPRIMER}
              onClick={() => telechargerPdf(`/documents/SALE/${detail.id}/print?fmt=pdf`, `ticket-${detail.reference}.pdf`)}>
              Télécharger le ticket (PDF)
            </Btn>
            {/* 2.7.35 — vente sur carnet (hôpital) : ordonnance sans montants. */}
            {(detail.patientId || detail.medicalStaffId) ? (
              <Btn icon={ClipboardList} style={PLEIN_ORDONNANCE}
                onClick={() => telechargerPdf(`/sales/${detail.id}/ordonnance?fmt=pdf`, `ordonnance-${detail.reference}.pdf`)}>
                Télécharger l’ordonnance (PDF)
              </Btn>
            ) : null}
            {can('cancel') && detail.status === 'VALIDATED' ? (
              <Btn variant="danger" icon={Ban} onClick={() => setAnnulation(detail)}>Annuler la vente</Btn>
            ) : null}
          </>}>
          <div className="grid grid--2">
            <dl className="kv">
              <dt>Date</dt><dd>{dateTime(detail.date)}</dd>
              <dt>État</dt><dd><StatusBadge status={detail.status} labels={STATUS_LABELS} /></dd>
              <dt>Client</dt><dd>{detail.customerName || 'Client de passage'}</dd>
              {/* 2.7.79 — « Servi par » saisi à la caisse (séparé de la note
                  par le serveur ; à défaut, c'est le compte de la vente). */}
              {detail.servedBy ? <><dt>Servi par</dt><dd>{detail.servedBy}</dd></> : null}
              {detail.note ? <><dt>Remarque</dt><dd>{detail.note}</dd></> : null}
            </dl>
            <dl className="kv">
              <dt>Montant</dt><dd>{money(detail.total)}</dd>
              {detail.costTotal !== undefined && can(['prices', 'costs']) ? <><dt>Coût retenu</dt><dd>{money(detail.costTotal)}</dd></> : null}
              {detail.margin !== undefined && can(['prices', 'costs']) ? <><dt>Marge</dt><dd>{money(detail.margin)}</dd></> : null}
              {detail.cancelledAt ? <><dt>Annulée le</dt><dd>{dateTime(detail.cancelledAt)}</dd></> : null}
              {detail.cancelReason ? <><dt>Motif d’annulation</dt><dd>{detail.cancelReason}</dd></> : null}
            </dl>
          </div>

          <h3 style={{ marginTop: 14 }}>Médicaments vendus — détail ligne par ligne</h3>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Médicament</th>
                  <th>Lot sorti</th>
                  <th className="num">Quantité</th>
                  <th className="num">Prix unitaire</th>
                  <th className="num">Valeur</th>
                  {can(['prices', 'costs']) ? <th className="num">Marge ligne</th> : null}
                </tr>
              </thead>
              <tbody>
                {(detail.lines || []).map(line => (
                  <tr key={line.id}>
                    <td className="wrap">{productName(line.productId)}</td>
                    <td>{lotNumber(line.lotId)}</td>
                    <td className="num">{quantiteVendue(line)}</td>
                    <td className="num">{money(line.unitPrice)}</td>
                    <td className="num">{money(Number(line.saleQuantity ?? line.quantity) * Number(line.unitPrice || 0))}</td>
                    {can(['prices', 'costs']) ? <td className="num">{money(line.margin)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detail.movements?.length ? (
            <>
              <h3 style={{ marginTop: 14 }}>Mouvements de stock liés</h3>
              <div className="table-scroll">
                <table className="data">
                  <thead><tr><th>#</th><th>Médicament</th><th>Lot</th><th className="num">Quantité</th><th>Motif</th></tr></thead>
                  <tbody>
                    {detail.movements.map(movement => (
                      <tr key={movement.id}>
                        <td>{movement.id}</td>
                        <td className="wrap">{productName(movement.productId)}</td>
                        <td>{lotNumber(movement.lotId)}</td>
                        <td className="num">{integer(movement.quantity)}</td>
                        <td className="wrap">{movement.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </Modal>
      ) : null}

      {/* ---------------------------- Annulation motivée --------------------- */}
      {annulation ? (
        <Modal title={`Annuler la vente ${annulation.reference}`} onClose={() => { setAnnulation(null); setMotif(''); }}
          footer={<>
            <Btn variant="ghost" onClick={() => { setAnnulation(null); setMotif(''); }}>Renoncer</Btn>
            <Btn variant="danger" icon={Ban} onClick={annuler} disabled={busy || motif.trim().length < 3}>Confirmer l’annulation</Btn>
          </>}>
          {error ? <ErrorBox error={error} /> : null}
          <p>
            L’annulation remet le stock en place (chaque médicament retourne dans son lot) et reste inscrite au
            journal : la vente n’est jamais effacée. Si la marchandise n’est plus en stock, le système refuse et
            propose une correction justifiée.
          </p>
          <Field label="Motif d’annulation (3 caractères minimum)">
            <Textarea value={motif} onChange={e => setMotif(e.target.value)}
              placeholder="Ex. : erreur de saisie, client non servi…" />
          </Field>
        </Modal>
      ) : null}
    </>
  );
}