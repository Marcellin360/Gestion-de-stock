// Transfert dépôt → pharmacie : c'est LE document qui fait passer la marchandise
// de la réserve au comptoir. On choisit des lots du dépôt (FEFO en tête), les
// quantités, et le motif. À la validation : sortie au dépôt, entrée en pharmacie,
// dans une seule opération.
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, ArrowRightLeft } from 'lucide-react';
import { stock } from '../api/endpoints.js';
import { newRequestKey } from '../api/client.js';
import { Badge, Btn, ErrorBox, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { useData } from '../context/DataContext.jsx';
import { integer, money } from '../utils/format.js';

export const TRANSFER_REASONS = [
  'Réassort du comptoir',
  'Demande du pharmacien',
  'Produit très demandé',
  'Ouverture d’un second rayon',
  'Retour du surplus au dépôt'
];

export default function TransferForm({ onDone, onCancel }) {
  const { lots, productName, settings } = useData();
  const [entete, setEntete] = useState({ reason: TRANSFER_REASONS[0], note: '' });
  const [lignes, setLignes] = useState([{ lotId: '', quantity: 1 }]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Seuls les lots du dépôt peuvent partir : c'est la réserve qui approvisionne.
  const lotsDepot = useMemo(
    () => lots.filter(lot => lot.location === 'DEPOT' && Number(lot.quantity) > 0)
      .sort((a, b) => String(a.expiresOn || '9999').localeCompare(String(b.expiresOn || '9999'))),
    [lots]
  );

  const maj = (index, patch) => setLignes(liste => liste.map((ligne, i) => (i === index ? { ...ligne, ...patch } : ligne)));

  const valeurEstimee = lignes.reduce((somme, ligne) => {
    const lot = lots.find(item => Number(item.id) === Number(ligne.lotId));
    return somme + (lot ? Number(lot.unitCost) : 0) * Number(ligne.quantity || 0);
  }, 0);

  const soumettre = async event => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const transfert = await stock.createTransfer({
        requestKey: newRequestKey(),
        fromLocation: 'DEPOT',
        toLocation: 'PHARMACY',
        reason: entete.reason,
        note: entete.note,
        lines: lignes.map(ligne => ({ lotId: Number(ligne.lotId), quantity: Number(ligne.quantity) }))
      });
      onDone(transfert);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={soumettre}>
      <ErrorBox error={error} />
      <div className="grid grid--2">
        <Field label="Motif du transfert" hint="C’est ce motif qui apparaît dans l’historique du dépôt">
          <Select value={entete.reason} onChange={e => setEntete({ ...entete, reason: e.target.value })}>
            {TRANSFER_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}
          </Select>
        </Field>
        <Field label="Sens du transfert">
          <Input value="Dépôt (réserve) → Pharmacie (comptoir)" readOnly />
        </Field>
      </div>

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Médicament / lot du dépôt</th>
              <th className="num">Stock dépôt</th>
              <th className="num">Quantité à transférer</th>
              <th className="num">Coût de revient</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, index) => {
              const lot = lots.find(item => Number(item.id) === Number(ligne.lotId));
              return (
                <tr key={index}>
                  <td style={{ minWidth: 300 }}>
                    <Select value={ligne.lotId} onChange={e => maj(index, { lotId: e.target.value })} required>
                      <option value="">— choisir un lot du dépôt —</option>
                      {lotsDepot.map(item => (
                        <option key={item.id} value={item.id}>
                          {productName(item.productId)} · lot {item.number} {item.expiresOn ? `(exp. ${item.expiresOn})` : '(sans date)'}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="num">{lot ? integer(lot.quantity) : '—'}</td>
                  <td className="num" style={{ minWidth: 130 }}>
                    <Input type="number" min="1" step="1" max={lot ? Number(lot.quantity) : undefined}
                      value={ligne.quantity} onChange={e => maj(index, { quantity: e.target.value })} required />
                  </td>
                  <td className="num">{money(lot ? Number(lot.unitCost) * Number(ligne.quantity || 0) : 0)}</td>
                  <td className="right">
                    <Btn variant="ghost" icon={Trash2} disabled={lignes.length === 1}
                      onClick={() => setLignes(liste => liste.filter((_, i) => i !== index))} aria-label="Retirer" />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Valeur transférée ({settings.valuation === 'CMP' ? 'CMP' : 'coût du lot'})</td>
              <td className="num">{money(valeurEstimee)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <Btn icon={Plus} onClick={() => setLignes(liste => [...liste, { lotId: '', quantity: 1 }])}>Ajouter un lot</Btn>
        <Badge tone="info">Le stock du dépôt diminue dans le même mouvement que celui de la pharmacie</Badge>
      </div>

      <Field label="Remarque (facultative)" hint="Ex. : besoin du week-end, rupture au comptoir depuis ce matin…">
        <Textarea value={entete.note} onChange={e => setEntete({ ...entete, note: e.target.value })} />
      </Field>

      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <Btn variant="ghost" onClick={onCancel}>Renoncer</Btn>
        <Btn variant="primary" type="submit" icon={ArrowRightLeft} disabled={busy}>
          {busy ? 'Transfert en cours…' : 'Valider le transfert'}
        </Btn>
      </div>
    </form>
  );
}
