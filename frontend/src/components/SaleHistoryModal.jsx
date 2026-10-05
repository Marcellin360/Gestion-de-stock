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
import { useMemo, useState } from 'react';
import { Ban, Eye, Printer, ShoppingCart } from 'lucide-react';
import { documents as documentsApi } from '../api/endpoints.js';
import { openPrintable } from '../api/client.js';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Empty, ErrorBox, Field, Input, Modal, Select, StatusBadge, Textarea } from './ui.jsx';
import { dateTime, integer, money, today, addDays } from '../utils/format.js';

const STATUS_LABELS = { VALIDATED: 'Validée', CANCELLED: 'Annulée', DRAFT: 'En cours', ABANDONED: 'Abandonnée' };
// 2.7.12 — vente au détail : affiche la quantité DANS L'UNITÉ vendue.
const UNITE_LABELS = { BOX: 'boîte', BLISTER: 'plaquette', UNIT: 'comprimé' };
const quantiteVendue = line => {
  const nombre = Number(line.saleQuantity ?? line.quantity);
  const unite = UNITE_LABELS[line.saleUnit || 'BOX'] || 'boîte';
  return `${Number.isInteger(nombre) ? integer(nombre) : nombre.toLocaleString('fr-FR')} ${nombre > 1 ? `${unite}s` : unite}`;
};

export default function SaleHistoryModal({ onClose }) {
  const { documents, productName, lotNumber, refresh } = useData();
  const { can } = useAuth();
  const toast = useToast();
  const [filtres, setFiltres] = useState({ periode: '', terme: '', statut: '' });
  const [detail, setDetail] = useState(null);
  const [annulation, setAnnulation] = useState(null);
  const [motif, setMotif] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Ventes de la pharmacie, les plus récentes d'abord (la liste « documents »
  // est déjà triée par le serveur : on conserve cet ordre).
  const ventes = useMemo(() => (documents || [])
    .filter(doc => doc.kind === 'SALE')
    .filter(doc => (filtres.periode ? String(doc.date).slice(0, 10) >= filtres.periode : true))
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
      <Modal title="Historique de vente — détail de chaque vente" onClose={onClose} wide
        footer={<Btn variant="primary" onClick={onClose}>Fermer</Btn>}>
        {/* Synthèse de la sélection : lisible sans ouvrir chaque vente. */}
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <Badge tone="info">{ventes.length} vente(s) affichée(s)</Badge>
          <Badge tone="ok">Encaissé (validées) : {money(totalEncaisse)}</Badge>
          {can(['prices', 'costs']) ? <Badge tone="default">Marge brute (validées) : {money(margeTotale)}</Badge> : null}
        </div>

        <div className="inline-form" style={{ marginBottom: 12 }}>
          <Field label="Depuis le">
            <Input type="date" value={filtres.periode} onChange={e => setFiltres({ ...filtres, periode: e.target.value })} />
          </Field>
          <Field label="État">
            <Select value={filtres.statut} onChange={e => setFiltres({ ...filtres, statut: e.target.value })}>
              <option value="">Toutes</option>
              {Object.entries(STATUS_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Recherche">
            <Input value={filtres.terme} onChange={e => setFiltres({ ...filtres, terme: e.target.value })}
              placeholder="Référence, client, remarque…" />
          </Field>
          <div className="row row--tight" style={{ alignItems: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setFiltres({ ...filtres, periode: today() })}>Aujourd’hui</Btn>
            <Btn variant="ghost" onClick={() => setFiltres({ ...filtres, periode: addDays(-7) })}>7 jours</Btn>
            <Btn variant="ghost" onClick={() => setFiltres({ ...filtres, periode: '' })}>Tout</Btn>
          </div>
        </div>

        {error ? <div style={{ marginBottom: 10 }}><ErrorBox error={error} /></div> : null}

        {ventes.length === 0 ? (
          <Empty>
            <ShoppingCart size={22} /> Aucune vente ne correspond à ces critères :
            modifiez la période ou la recherche.
          </Empty>
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
                  <th />
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
                    <td className="right nowrap">
                      <Btn variant="ghost" icon={Eye} onClick={() => ouvrir(doc)} aria-label="Détail">Détail</Btn>
                      <Btn variant="ghost" icon={Printer}
                        onClick={() => openPrintable(`/documents/SALE/${doc.id}/print`)} aria-label="Imprimer le ticket" />
                      {can('cancel') && doc.status === 'VALIDATED' ? (
                        <Btn variant="ghost" icon={Ban} onClick={() => setAnnulation(doc)} aria-label="Annuler" />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
          « Détail » montre chaque médicament vendu : lot sorti, quantité, prix unitaire et valeur.
          L’annulation remet le stock en place et reste inscrite au journal : rien ne s’efface.
        </p>
      </Modal>

      {/* --------------------------- Détail d'une vente ---------------------- */}
      {detail ? (
        <Modal title={`Vente ${detail.reference}`} onClose={() => setDetail(null)} wide
          footer={<>
            <Btn variant="ghost" onClick={() => setDetail(null)}>Retour à la liste</Btn>
            <Btn icon={Printer} onClick={() => openPrintable(`/documents/SALE/${detail.id}/print`)}>Imprimer le ticket</Btn>
            {can('cancel') && detail.status === 'VALIDATED' ? (
              <Btn variant="danger" icon={Ban} onClick={() => setAnnulation(detail)}>Annuler la vente</Btn>
            ) : null}
          </>}>
          <div className="grid grid--2">
            <dl className="kv">
              <dt>Date</dt><dd>{dateTime(detail.date)}</dd>
              <dt>État</dt><dd><StatusBadge status={detail.status} labels={STATUS_LABELS} /></dd>
              <dt>Client</dt><dd>{detail.customerName || 'Client de passage'}</dd>
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