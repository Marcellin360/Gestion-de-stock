// Lots et stock réel : quantités par lot, dates de péremption, mise en quarantaine.
// La vente FEFO s'appuie sur ces informations.
import { useMemo, useState } from 'react';
import { Ban, Eye, ShieldCheck, Printer } from 'lucide-react';
import { stock } from '../api/endpoints.js';
import { openPrintable } from '../api/client.js';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Input, Modal, Select, StatusBadge, Textarea } from '../components/ui.jsx';
import { date, daysTo, integer, money, expiryLabel, LOCATION_SHORT } from '../utils/format.js';

export default function LotsPage() {
  const { lots, products, productName, settings, refresh } = useData();
  const { can, user } = useAuth();
  const toast = useToast();
  // Le dépôt ne travaille que sur ses propres lots ; les autres profils peuvent
  // basculer entre les deux magasins (ou voir les deux).
  const estDepot = user?.roleCode === 'DEPOT';
  const magasinParDefaut = estDepot ? 'DEPOT' : '';
  const [filtres, setFiltres] = useState({ produit: '', terme: '', statut: '', echeance: '', magasin: magasinParDefaut });
  const [cible, setCible] = useState(null);
  const [motif, setMotif] = useState('');
  const [mouvements, setMouvements] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const lignes = useMemo(() => lots.filter(lot => {
    if (filtres.magasin && lot.location !== filtres.magasin) return false;
    if (filtres.produit && Number(lot.productId) !== Number(filtres.produit)) return false;
    if (filtres.statut && lot.status !== filtres.statut) return false;
    if (filtres.terme && !String(lot.number).toLowerCase().includes(filtres.terme.toLowerCase())) return false;
    if (filtres.echeance === 'perime' && !(lot.expiresOn && daysTo(lot.expiresOn) < 0)) return false;
    if (filtres.echeance === 'proche' && !(lot.expiresOn && daysTo(lot.expiresOn) >= 0 && daysTo(lot.expiresOn) <= Number(settings.expiryDays || 90))) return false;
    if (filtres.echeance === 'sans' && lot.expiresOn) return false;
    return true;
  }), [lots, filtres, settings.expiryDays]);

  const basculer = async () => {
    setBusy(true);
    setError(null);
    try {
      const nouveau = cible.status === 'BLOCKED' ? 'AVAILABLE' : 'BLOCKED';
      await stock.setLotStatus(cible.id, nouveau, motif);
      toast.success(nouveau === 'BLOCKED' ? 'Lot bloqué : il n’est plus proposé à la vente.' : 'Lot remis en vente.');
      setCible(null);
      setMotif('');
      await refresh();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const voirMouvements = async lot => {
    setError(null);
    try {
      const liste = await stock.lotMovements(lot.id);
      setMouvements({ lot, liste: Array.isArray(liste) ? liste : liste.movements || [] });
    } catch (cause) {
      setError(cause);
    }
  };

  return (
    <>
      <Card title={`${lignes.length} lot(s)`}
          actions={<Btn variant="ghost" icon={Printer}
          onClick={() => openPrintable(`/reports/print?type=stock&from=${new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}&location=${filtres.magasin || 'ALL'}`)}>
          État de stock imprimable
        </Btn>}>
        <div className="inline-form" style={{ marginBottom: 12 }}>
                    {estDepot ? (
            <Field label="Magasin" hint="Votre profil travaille sur la réserve : seuls les lots du dépôt sont affichés.">
              <Input value="Dépôt (réserve)" readOnly />
            </Field>
          ) : (
            <Field label="Magasin">
              <Select value={filtres.magasin} onChange={e => setFiltres({ ...filtres, magasin: e.target.value })}>
                <option value="">Les deux magasins</option>
                <option value="DEPOT">Dépôt (réserve)</option>
                <option value="PHARMACY">Pharmacie (comptoir)</option>
              </Select>
            </Field>
          )}
          <Field label="Médicament">
            <Select value={filtres.produit} onChange={e => setFiltres({ ...filtres, produit: e.target.value })}>
              <option value="">Tous</option>
              {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
            </Select>
          </Field>
          <Field label="Numéro de lot">
            <Input value={filtres.terme} onChange={e => setFiltres({ ...filtres, terme: e.target.value })} placeholder="Ex. LOT-A" />
          </Field>
          <Field label="État">
            <Select value={filtres.statut} onChange={e => setFiltres({ ...filtres, statut: e.target.value })}>
              <option value="">Tous</option>
              <option value="AVAILABLE">En vente</option>
              <option value="BLOCKED">Bloqué</option>
            </Select>
          </Field>
          <Field label="Échéance">
            <Select value={filtres.echeance} onChange={e => setFiltres({ ...filtres, echeance: e.target.value })}>
              <option value="">Toutes</option>
              <option value="proche">À surveiller</option>
              <option value="perime">Périmés</option>
              <option value="sans">Sans date</option>
            </Select>
          </Field>
        </div>

        {error ? <ErrorBox error={error} /> : null}

        {lignes.length === 0 ? <Empty>Aucun lot ne correspond à ces critères.</Empty> : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Médicament</th><th>Magasin</th><th>Lot</th><th className="num">Quantité</th>
                  {can(['prices', 'costs']) ? <th className="num">Coût retenu</th> : null}
                  <th>Expiration</th><th>État</th><th />
                </tr>
              </thead>
              <tbody>
                {lignes.map(lot => (
                  <tr key={lot.id}>
                    <td className="wrap">{productName(lot.productId)}</td>
                    <td><Badge tone={lot.location === 'DEPOT' ? 'info' : 'default'}>{(LOCATION_SHORT[lot.location] || '—')}</Badge></td>
                    <td>{lot.number}</td>
                    <td className="num">{integer(lot.quantity)}</td>
                    {can(['prices', 'costs']) ? <td className="num">{money(settings.valuation === 'CMP' ? lot.unitCost : lot.purchasePrice)}</td> : null}
                    <td>
                      {expiryLabel(lot.expiresOn)}
                      {lot.expiresOn && daysTo(lot.expiresOn) < 0 ? <Badge tone="danger">périmé</Badge> : null}
                    </td>
                    <td>
                      <StatusBadge status={lot.status} labels={{ AVAILABLE: 'En vente', BLOCKED: 'Bloqué' }} />
                      {lot.blockReason ? <div className="muted" style={{ fontSize: '.78rem' }}>{lot.blockReason}</div> : null}
                    </td>
                    <td className="right nowrap">
                      <Btn variant="ghost" icon={Eye} onClick={() => voirMouvements(lot)} aria-label="Mouvements" />
                      {can('inventory') ? (
                        <Btn variant="ghost" icon={lot.status === 'BLOCKED' ? ShieldCheck : Ban}
                          onClick={() => { setCible(lot); setMotif(''); }} aria-label="Bloquer ou débloquer" />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {cible ? (
        <Modal title={`${cible.status === 'BLOCKED' ? 'Remettre en vente' : 'Bloquer'} le lot ${cible.number}`}
          onClose={() => { setCible(null); setError(null); }}
          footer={<>
            <Btn variant="ghost" onClick={() => { setCible(null); setError(null); }}>Renoncer</Btn>
            <Btn variant={cible.status === 'BLOCKED' ? 'primary' : 'danger'} icon={ShieldCheck} onClick={basculer} disabled={busy || motif.trim().length < 3}>
              Confirmer
            </Btn>
          </>}>
          <ErrorBox error={error} />
          <p>
            Un lot bloqué est exclu de la vente et des propositions FEFO, mais reste compté dans le stock.
            Utilisez cette fonction pour un contrôle qualité, une suspicion de contrefaçon ou un rappel de lot.
          </p>
          <Field label="Justification (3 caractères minimum)">
            <Textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ex. : contrôle qualité, rappel du laboratoire…" />
          </Field>
        </Modal>
      ) : null}

      {mouvements ? (
        <Modal title={`Mouvements du lot ${mouvements.lot.number}`} onClose={() => setMouvements(null)} wide
          footer={<Btn variant="ghost" onClick={() => setMouvements(null)}>Fermer</Btn>}>
          {mouvements.liste.length === 0 ? <Empty>Aucun mouvement pour ce lot.</Empty> : (
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>#</th><th>Date</th><th>Type</th><th className="num">Quantité</th><th>Motif</th></tr></thead>
                <tbody>
                  {mouvements.liste.map(movement => (
                    <tr key={movement.id}>
                      <td>{movement.id}</td>
                      <td>{date(movement.createdAt)}</td>
                      <td>{movement.kind}</td>
                      <td className="num">{movement.quantity}</td>
                      <td className="wrap">{movement.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      ) : null}
    </>
  );
}
