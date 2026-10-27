// 2.7.79 — CORRECTION D'UN TRANSFERT (demande de l'officine) : le bouton
// « Modifier » de l'historique ouvre ce formulaire pré-rempli avec le contenu
// ACTUEL du transfert (lots, quantités, motif, remarque). On corrige les
// quantités (erreurs de saisie), le motif et la remarque ; à l'envoi, la
// demande part à l'ADMINISTRATEUR qui valide ou refuse — le stock ne bouge
// qu'à sa validation (même règle que les corrections de réception, 2.7.34).
//
// Garde-fou côté serveur : aucun lot du transfert ne doit avoir bougé depuis
// (vente, perte, inventaire, autre transfert) ; sinon la demande est refusée
// et le chemin reste l'annulation tracée du document.
import { useEffect, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { stock } from '../api/endpoints.js';
import { Banner, Btn, ErrorBox, Field, Input, Select, Spinner, Textarea } from '../components/ui.jsx';
import { useData } from '../context/DataContext.jsx';
import { TRANSFER_REASONS } from './TransferForm.jsx';
import { integer } from '../utils/format.js';

export default function TransferCorrectionForm({ transfert, onCancel, onDone }) {
  const { productName } = useData();
  // Contenu actuel du transfert, pré-rempli (le serveur renvoie les lots).
  const [lignes, setLignes] = useState(null);
  const [entete, setEntete] = useState({ transferReason: TRANSFER_REASONS[0], note: '' });
  const [motif, setMotif] = useState('');      // motif DE LA CORRECTION (lu par l'admin)
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let annule = false;
    stock.transfer(transfert.id).then(({ transfer, lines }) => {
      if (annule) return;
      setEntete({ transferReason: transfer.reason || TRANSFER_REASONS[0], note: transfer.note || '' });
      setLignes((lines || []).map(ligne => ({
        lotId: ligne.fromLotId,
        lot: ligne.lot,
        product: ligne.product,
        quantity: Number(ligne.quantity),          // quantité corrigée (pré-remplie = actuelle)
        originale: Number(ligne.quantity)
      })));
    }).catch(cause => { if (!annule) setError(cause); });
    return () => { annule = true; };
  }, [transfert.id]);

  const changerQuantite = (lotId, valeur) => setLignes(liste => liste.map(ligne =>
    Number(ligne.lotId) === Number(lotId) ? { ...ligne, quantity: valeur } : ligne));
  const retirer = lotId => setLignes(liste => liste.filter(ligne => Number(ligne.lotId) !== Number(lotId)));

  const soumettre = async event => {
    event.preventDefault();
    if (motif.trim().length < 3) {
      setError({ message: 'Le motif de la correction est obligatoire (3 caractères minimum) : l’administrateur le lira pour trancher.' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await stock.proposerCorrectionTransfert(transfert.id, {
        reason: motif.trim(),
        transferReason: entete.transferReason,
        note: entete.note,
        lines: lignes.map(ligne => ({ lotId: Number(ligne.lotId), quantity: Number(ligne.quantity) }))
      });
      onDone();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={soumettre}>
      <ErrorBox error={error} />
      <Banner tone="warn" title="Correction soumise à validation">
        Le transfert <strong>{transfert.reference}</strong> ne change PAS tout de suite :
        votre correction part à l’administrateur, qui <strong>valide ou refuse</strong>.
        Elle n’est possible que tant qu’aucun lot du transfert n’a bougé depuis.
      </Banner>

      {lignes === null ? <Spinner /> : (
        <>
          <div className="grid grid--2" style={{ marginTop: 10 }}>
            <Field label="Motif du transfert (corrigé)">
              <Select value={entete.transferReason} onChange={e => setEntete({ ...entete, transferReason: e.target.value })}>
                {TRANSFER_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}
              </Select>
            </Field>
            <Field label="Remarque (corrigée, facultative)">
              <Input value={entete.note} onChange={e => setEntete({ ...entete, note: e.target.value })} maxLength={255} />
            </Field>
          </div>

          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Médicament / lot du dépôt</th>
                  <th className="num">Quantité actuelle</th>
                  <th className="num">Quantité corrigée</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lignes.map(ligne => (
                  <tr key={ligne.lotId}>
                    <td className="wrap"><strong>{ligne.product || productName(ligne.productId)}</strong> · lot {ligne.lot}</td>
                    <td className="num">{integer(ligne.originale)}</td>
                    <td className="num" style={{ minWidth: 120 }}>
                      <Input type="number" min="1" step="1" value={ligne.quantity} required
                        onChange={e => changerQuantite(ligne.lotId, e.target.value)} />
                    </td>
                    <td className="right">
                      <Btn variant="danger" icon={Trash2} disabled={lignes.length === 1}
                        onClick={() => retirer(ligne.lotId)} aria-label="Retirer cette ligne" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: '.8rem', marginTop: 6 }}>
            Seules les quantités des lots d’origine se corrigent ; pour un médicament
            supplémentaire, faites un « Nouveau transfert » séparé.
          </p>
        </>
      )}

      <Field label="Motif de la correction *" hint="Obligatoire : lu par l’administrateur pour décider">
        <Textarea value={motif} onChange={e => setMotif(e.target.value)}
          placeholder="Ex. : erreur de saisie sur la quantité du lot, mauvaise ligne…" />
      </Field>

      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <Btn variant="ghost" onClick={onCancel}>Renoncer</Btn>
        <Btn variant="primary" type="submit" icon={Send}
          disabled={busy || lignes === null || motif.trim().length < 3}>
          {busy ? 'Envoi…' : 'Envoyer la correction à l’administrateur'}
        </Btn>
      </div>
    </form>
  );
}