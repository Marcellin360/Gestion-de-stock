// Déclaration d'une perte ou d'un don : motif imposé, remarque justificative
// obligatoire, sortie au coût retenu (jamais au prix de vente) — RG06, RG07.
import { useMemo, useState } from 'react';
import { Plus, Trash2, PackageMinus } from 'lucide-react';
import { stock } from '../api/endpoints.js';
import { newRequestKey } from '../api/client.js';
import { Btn, ErrorBox, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { integer, money, today } from '../utils/format.js';

export const LOSS_REASONS = ['Casse', 'Détérioration', 'Expiration', 'Perte', 'Don', 'Rappel'];

export default function LossForm({ onDone, onCancel }) {
  const { lots, productName, settings } = useData();
  const { user } = useAuth();
  // Le dépôt déclare ses propres pertes (réserve) ; le pharmacien celles du comptoir.
  const [entete, setEntete] = useState({
    location: user?.roleCode === 'DEPOT' ? 'DEPOT' : 'PHARMACY',
    reason: LOSS_REASONS[0], note: ''
  });
  const [lignes, setLignes] = useState([{ lotId: '', quantity: 1 }]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Seuls les lots du magasin choisi peuvent être sortis : impossible de déclarer
  // une perte au comptoir sur un lot resté dans la réserve.
  const lotsDisponibles = useMemo(
    () => lots.filter(lot => lot.location === entete.location && Number(lot.quantity) > 0)
      .sort((a, b) => String(a.expiresOn || '9999').localeCompare(String(b.expiresOn || '9999'))),
    [lots, entete.location]
  );

  const maj = (index, patch) => setLignes(liste => liste.map((ligne, i) => (i === index ? { ...ligne, ...patch } : ligne)));

  const coutEstime = lignes.reduce((somme, ligne) => {
    const lot = lots.find(item => Number(item.id) === Number(ligne.lotId));
    const cout = lot ? Number(settings.valuation === 'CMP' ? lot.unitCost : lot.purchasePrice) : 0;
    return somme + cout * Number(ligne.quantity || 0);
  }, 0);

  const soumettre = async event => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const perte = await stock.createLoss({
        requestKey: newRequestKey(),
        location: entete.location,
        reason: entete.reason,
        note: entete.note,
        lines: lignes.map(ligne => ({ lotId: Number(ligne.lotId), quantity: Number(ligne.quantity) }))
      });
      onDone(perte);
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
        {user?.roleCode === 'DEPOT' ? (
          <Field label="Magasin concerné" hint="Votre profil travaille sur la réserve : la perte ou le don se déclare au dépôt.">
            <Input value="Dépôt (réserve)" readOnly />
          </Field>
        ) : (
          <Field label="Magasin concerné" hint="Une sortie ne peut se faire que dans le magasin où se trouve le lot">
            <Select value={entete.location} required
              onChange={e => { setEntete({ ...entete, location: e.target.value }); setLignes([{ lotId: '', quantity: 1 }]); }}>
              <option value="PHARMACY">Pharmacie (comptoir)</option>
              <option value="DEPOT">Dépôt (réserve)</option>
            </Select>
          </Field>
        )}
        <Field label="Motif">
          <Select value={entete.reason} onChange={e => setEntete({ ...entete, reason: e.target.value })}>
            {LOSS_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}
          </Select>
        </Field>
        <Field label="Date du constat" hint="Enregistrée automatiquement à la validation">
          <Input type="date" value={today()} readOnly />
        </Field>
      </div>

      <div className="table-scroll">
        <table className="data">
          <thead><tr><th>Médicament / lot</th><th className="num">Stock du lot</th><th className="num">Quantité retirée</th><th className="num">Coût retenu</th><th /></tr></thead>
          <tbody>
            {lignes.map((ligne, index) => {
              const lot = lots.find(item => Number(item.id) === Number(ligne.lotId));
              const cout = lot ? Number(settings.valuation === 'CMP' ? lot.unitCost : lot.purchasePrice) : 0;
              return (
                <tr key={index}>
                  <td style={{ minWidth: 300 }}>
                    <Select value={ligne.lotId} onChange={e => maj(index, { lotId: e.target.value })} required>
                      <option value="">— choisir un lot —</option>
                      {lotsDisponibles.map(item => (
                        <option key={item.id} value={item.id}
                          title={`${productName(item.productId)} · lot ${item.number} — stock restant de ce lot : ${integer(item.quantity)} ${entete.location === 'DEPOT' ? '(dépôt)' : '(comptoir)'}`}>
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
                  <td className="num">{money(cout * Number(ligne.quantity || 0))}</td>
                  <td className="right">
                    <Btn variant="ghost" icon={Trash2} disabled={lignes.length === 1} onClick={() => setLignes(liste => liste.filter((_, i) => i !== index))} aria-label="Retirer" />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><td colSpan={3}>Coût total sorti du stock</td><td className="num">{money(coutEstime)}</td><td /></tr></tfoot>
        </table>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <Btn icon={Plus} onClick={() => setLignes(liste => [...liste, { lotId: '', quantity: 1 }])}>Ajouter un lot</Btn>
      </div>

      <Field label="Remarque justificative (3 caractères minimum)" hint="Ex. : flacons cassés lors du rangement du 12/09, don à l’hôpital…">
        <Textarea value={entete.note} onChange={e => setEntete({ ...entete, note: e.target.value })} required />
      </Field>

      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <Btn variant="ghost" onClick={onCancel}>Renoncer</Btn>
        <Btn variant="danger" type="submit" icon={PackageMinus} disabled={busy || entete.note.trim().length < 3}>
          {busy ? 'Enregistrement…' : 'Enregistrer la perte'}
        </Btn>
      </div>
    </form>
  );
}