// Modification du taux de marge : prix recalculé, motif obligatoire et trace
// complète dans l'historique des prix (RG23, RG24).
import { useEffect, useState } from 'react';
import { referentials } from '../api/endpoints.js';
import { Btn, Choice, ErrorBox, Field, Input, Select, Table, Textarea } from '../components/ui.jsx';
import { useData } from '../context/DataContext.jsx';
import { dateTime, money, percent } from '../utils/format.js';

export default function MarginForm({ produit, onDone, onCancel }) {
  const { settings } = useData();
  const [rate, setRate] = useState(Number(produit.marginRate));
  const [reason, setReason] = useState('');
  const [historique, setHistorique] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    referentials.priceHistory(produit.id).then(setHistorique).catch(() => setHistorique([]));
  }, [produit.id]);

  // Taux proposés dans la plage autorisée : un clic au lieu d'une saisie.
  const tauxRapides = [settings.minMargin, 15, 20, 25, settings.maxMargin]
    .map(taux => Number(taux))
    .filter((taux, index, liste) => Number.isFinite(taux) && taux >= Number(settings.minMargin)
      && taux <= Number(settings.maxMargin) && liste.indexOf(taux) === index)
    .sort((a, b) => a - b);

  // Motifs courants : choisis dans la liste, complétés librement si besoin.
  const motifs = [
    'Décision du pharmacien',
    'Alignement sur le marché',
    'Hausse du prix fournisseur',
    'Promotion temporaire',
    'Produit à écouler rapidement',
    'Retour à la marge normale'
  ];

  const cout = Number(produit.cmp || 0);
  const prevision = settings.marginMode === 'SALE'
    ? cout / (1 - Number(rate) / 100)
    : cout * (1 + Number(rate) / 100);

  const soumettre = async event => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const resultat = await referentials.margin(produit.id, Number(rate), reason);
      onDone(resultat);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={soumettre}>
      <ErrorBox error={error} />
      <p>
        Prix de vente actuel : <strong>{money(produit.sellingPrice)}</strong> · coût retenu : <strong>{money(cout)}</strong>.
        Plage autorisée : {percent(settings.minMargin)} à {percent(settings.maxMargin)} ({settings.marginMode === 'SALE' ? 'marge sur prix de vente' : 'marge sur coût d’achat'}).
      </p>

      <Field label="Taux de marge" hint="Choisissez un taux, ou saisissez-le précisément">
        <Choice options={tauxRapides.map(taux => ({ value: String(taux), label: `${taux} %` }))}
          value={String(rate)} onChange={valeur => setRate(Number(valeur))} columns={tauxRapides.length} />
      </Field>

      <div className="grid grid--2">
        <Field label="Taux précis (%)">
          <Input type="number" step="0.01" min={settings.minMargin} max={settings.maxMargin}
            value={rate} onChange={e => setRate(e.target.value)} required />
        </Field>
        <Field label="Prix de vente prévisionnel" hint="Calculé par le serveur à l’enregistrement">
          <Input value={money(prevision)} readOnly />
        </Field>
      </div>

      <Field label="Motif de la modification (obligatoire)">
        <Select value={motifs.includes(reason) ? reason : (reason ? 'autre' : '')}
          onChange={e => setReason(e.target.value === 'autre' ? '' : e.target.value)}>
          <option value="">— choisir dans la liste —</option>
          {motifs.map(motif => <option key={motif} value={motif}>{motif}</option>)}
          <option value="autre">Autre motif (à préciser ci-dessous)</option>
        </Select>
      </Field>
      <Field label="Précision du motif" hint="Obligatoire si « Autre motif », facultatif sinon">
        <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex. : alignement sur le marché, décision du pharmacien…" required />
      </Field>

      <h3>Historique des prix</h3>
      {historique === null ? <p className="muted">Chargement…</p> : historique.length === 0 ? (
        <p className="muted">Aucun changement enregistré pour l’instant.</p>
      ) : (
        <Table columns={[{ label: 'Date' }, { label: 'Ancien taux' }, { label: 'Nouveau taux' }, { label: 'Prix', num: true }, { label: 'Motif' }]}>
          {historique.map(entree => (
            <tr key={entree.id}>
              <td>{dateTime(entree.createdAt)}</td>
              <td>{percent(entree.previousRate)}</td>
              <td>{percent(entree.rate)}</td>
              <td className="num">{money(entree.price)}</td>
              <td className="wrap">{entree.reason}</td>
            </tr>
          ))}
        </Table>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <Btn variant="ghost" onClick={onCancel}>Renoncer</Btn>
        <Btn variant="primary" type="submit" disabled={busy || reason.trim().length < 3}>{busy ? 'Enregistrement…' : 'Appliquer le nouveau taux'}</Btn>
      </div>
    </form>
  );
}
