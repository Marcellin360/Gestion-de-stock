// Registre des documents : réceptions (dépôt), transferts, ventes (pharmacie),
// pertes et ajustements d’inventaire.
// Aucun document ne se supprime : on consulte, on imprime, ou on annule avec motif.
import { useMemo, useState } from 'react';
import { Ban, Eye, Printer, Search } from 'lucide-react';
import { documents as documentsApi } from '../api/endpoints.js';
import { openPrintable } from '../api/client.js';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Input, Modal, Select, StatusBadge, Textarea } from '../components/ui.jsx';
import { DOCUMENT_LABELS, LOCATION_SHORT, locationLabel, dateTime, money, date } from '../utils/format.js';

const STATUS_LABELS = { VALIDATED: 'Validé', CANCELLED: 'Annulé', DRAFT: 'En cours', ABANDONED: 'Abandonné' };

export default function DocumentsPage() {
  const { documents, productName, refresh } = useData();
  const { can, user } = useAuth();
  const toast = useToast();
  const [filtres, setFiltres] = useState({
    kind: '', status: '', periode: '', terme: '',
    magasin: user?.roleCode === 'DEPOT' ? 'DEPOT' : ''
  });
  const [detail, setDetail] = useState(null);
  const [annulation, setAnnulation] = useState(null);
  const [motif, setMotif] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const lignes = useMemo(() => (documents || []).filter(doc => {
    if (filtres.kind && doc.kind !== filtres.kind) return false;
    if (filtres.status && doc.status !== filtres.status) return false;
    if (filtres.periode && String(doc.date).slice(0, 10) < filtres.periode) return false;
    if (filtres.terme) {
      const needle = filtres.terme.toLowerCase();
      const haystack = [doc.reference, doc.customerName, doc.reason].join(' ').toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filtres.magasin) {
      // Un transfert touche les deux magasins : il compte pour le dépôt (sortie)
      // comme pour la pharmacie (entrée).
      const concerne = doc.kind === 'TRANSFER'
        ? true
        : (doc.location || (doc.kind === 'RECEIPT' ? 'DEPOT' : doc.kind === 'SALE' ? 'PHARMACY' : '')) === filtres.magasin;
      if (!concerne) return false;
      if (doc.kind === 'TRANSFER' && doc.fromLocation !== filtres.magasin && doc.toLocation !== filtres.magasin) return false;
    }
    return true;
  }), [documents, filtres]);

  const ouvrir = async doc => {
    setError(null);
    try {
      setDetail(await documentsApi.detail(doc.kind, doc.id));
    } catch (cause) {
      setError(cause);
    }
  };

  const annuler = async () => {
    setBusy(true);
    setError(null);
    try {
      const reponse = await documentsApi.cancel(annulation.kind, annulation.id, motif);
      toast.success(`Document ${reponse.reference || ''} annulé — stock remis en place.`);
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
      <Card title={`${lignes.length} document(s) affiché(s)`}
        actions={can('reports') ? <Btn variant="ghost" icon={Printer} onClick={() => openPrintable('/reports/print?type=movements&from=' + new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10) + '&to=' + new Date().toISOString().slice(0, 10))}>Journal imprimable</Btn> : null}>
        <div className="inline-form" style={{ marginBottom: 12 }}>
          <Field label="Type">
            <Select value={filtres.kind} onChange={e => setFiltres({ ...filtres, kind: e.target.value })}>
              <option value="">Tous</option>
              {Object.entries(DOCUMENT_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </Select>
          </Field>
          <Field label="État">
            <Select value={filtres.status} onChange={e => setFiltres({ ...filtres, status: e.target.value })}>
              <option value="">Tous</option>
              {Object.entries(STATUS_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </Select>
          </Field>
          <Field label="À partir du">
            <Input type="date" value={filtres.periode} onChange={e => setFiltres({ ...filtres, periode: e.target.value })} />
          </Field>
          <Field label="Magasin">
            <Select value={filtres.magasin} onChange={e => setFiltres({ ...filtres, magasin: e.target.value })}>
              <option value="">Tous les magasins</option>
              <option value="DEPOT">Dépôt (réserve)</option>
              <option value="PHARMACY">Pharmacie (comptoir)</option>
            </Select>
          </Field>
          <Field label="Recherche">
            <Input value={filtres.terme} onChange={e => setFiltres({ ...filtres, terme: e.target.value })} placeholder="Référence, client, motif…" />
          </Field>
        </div>

        {error ? <ErrorBox error={error} /> : null}

        {lignes.length === 0 ? <Empty>Aucun document ne correspond à ces critères.</Empty> : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Référence</th><th>Type</th><th>Magasin</th><th>Date</th><th>Détail</th>
                  <th className="num">Montant</th><th>État</th><th />
                </tr>
              </thead>
              <tbody>
                {lignes.map(doc => (
                  <tr key={`${doc.kind}-${doc.id}`}>
                    <td><strong>{doc.reference}</strong></td>
                    <td>{DOCUMENT_LABELS[doc.kind] || doc.kind}</td>
                    <td>
                      {doc.kind === 'TRANSFER'
                        ? <Badge tone="info">Dépôt → Pharmacie</Badge>
                        : <Badge tone={doc.location === 'DEPOT' ? 'info' : 'default'}>
                          {LOCATION_SHORT[doc.location] || (doc.kind === 'SALE' ? 'Pharmacie' : 'Dépôt')}
                        </Badge>}
                    </td>
                    <td>{dateTime(doc.date)}</td>
                    <td className="wrap">{doc.customerName || doc.reason || '—'}</td>
                    <td className="num">{money(doc.total)}</td>
                    <td>
                      <StatusBadge status={doc.status} labels={STATUS_LABELS} />
                      {doc.kind === 'TRANSFER' && doc.status === 'VALIDATED'
                        ? <div className="muted" style={{ fontSize: '.78rem' }}>
                          {locationLabel(doc.fromLocation)} → {locationLabel(doc.toLocation)}
                        </div>
                        : null}
                    </td>
                    <td className="right nowrap">
                      <Btn variant="ghost" icon={Eye} onClick={() => ouvrir(doc)} aria-label="Détail" />
                      <Btn variant="ghost" icon={Printer} onClick={() => openPrintable(`/documents/${doc.kind}/${doc.id}/print`)} aria-label="Imprimer" />
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
      </Card>

      {detail ? (
        <Modal title={`${DOCUMENT_LABELS[detail.kind] || detail.kind} ${detail.reference}`} onClose={() => setDetail(null)} wide
          footer={<>
            <Btn variant="ghost" onClick={() => setDetail(null)}>Fermer</Btn>
            <Btn icon={Printer} onClick={() => openPrintable(`/documents/${detail.kind}/${detail.id}/print`)}>Imprimer</Btn>
            {can('cancel') && detail.status === 'VALIDATED' ? <Btn variant="danger" icon={Ban} onClick={() => setAnnulation(detail)}>Annuler le document</Btn> : null}
          </>}>
          <div className="grid grid--2">
            <dl className="kv">
              <dt>Date</dt><dd>{dateTime(detail.date)}</dd>
              <dt>État</dt><dd><StatusBadge status={detail.status} labels={STATUS_LABELS} /></dd>
              <dt>Montant</dt><dd>{money(detail.total)}</dd>
              {detail.customerName ? <><dt>Client</dt><dd>{detail.customerName}</dd></> : null}
              {detail.reason ? <><dt>Motif</dt><dd>{detail.reason}</dd></> : null}
              {detail.invoiceRef ? <><dt>Facture</dt><dd>{detail.invoiceRef}</dd></> : null}
            </dl>
            <dl className="kv">
              {detail.costTotal !== undefined && can(['prices', 'costs']) ? <><dt>Coût retenu</dt><dd>{money(detail.costTotal)}</dd></> : null}
              {detail.margin !== undefined && can(['prices', 'costs']) ? <><dt>Marge</dt><dd>{money(detail.margin)}</dd></> : null}
              {detail.cancelledAt ? <><dt>Annulé le</dt><dd>{dateTime(detail.cancelledAt)}</dd></> : null}
              {detail.cancelReason ? <><dt>Motif d’annulation</dt><dd>{detail.cancelReason}</dd></> : null}
            </dl>
          </div>

          <h3 style={{ marginTop: 14 }}>Lignes</h3>
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Médicament</th><th>Lot</th><th className="num">Quantité</th><th className="num">Prix / coût unitaire</th></tr></thead>
              <tbody>
                {detail.lines.map(line => (
                  <tr key={line.id}>
                    <td className="wrap">{productName(line.productId)}</td>
                    <td>{line.lotId}</td>
                    <td className="num">{line.quantity}</td>
                    <td className="num">{money(line.unitPrice ?? line.unitCost ?? line.purchasePrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ marginTop: 14 }}>Mouvements de stock liés</h3>
          {detail.movements?.length ? (
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>#</th><th>Médicament</th><th>Lot</th><th className="num">Quantité</th><th>Motif</th></tr></thead>
                <tbody>
                  {detail.movements.map(movement => (
                    <tr key={movement.id}>
                      <td>{movement.id}</td>
                      <td className="wrap">{productName(movement.productId)}</td>
                      <td>{movement.lotId}</td>
                      <td className="num">{movement.quantity}</td>
                      <td className="wrap">{movement.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>Aucun mouvement (document non validé).</Empty>}
        </Modal>
      ) : null}

      {annulation ? (
        <Modal title="Annuler ce document" onClose={() => { setAnnulation(null); setError(null); }}
          footer={<>
            <Btn variant="ghost" onClick={() => { setAnnulation(null); setError(null); }}>Renoncer</Btn>
            <Btn variant="danger" icon={Ban} onClick={annuler} disabled={busy || motif.trim().length < 3}>Confirmer l’annulation</Btn>
          </>}>
          <ErrorBox error={error} />
          <p>
            L’annulation remet le stock en place et reste inscrite au journal : le document n’est jamais effacé.
            Si la marchandise n’est plus en stock, le système refuse et propose une correction justifiée.
          </p>
          <Field label="Motif d’annulation (3 caractères minimum)">
            <Textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ex. : erreur de saisie, client non servi…" />
          </Field>
        </Modal>
      ) : null}
    </>
  );
}
