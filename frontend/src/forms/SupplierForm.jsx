// Fiche fournisseur (grossiste, laboratoire, distributeur).
import { useState } from 'react';
import { referentials } from '../api/endpoints.js';
import { Btn, Check, ErrorBox, Field, Input, Textarea } from '../components/ui.jsx';

const vide = { name: '', contact: '', phone: '', email: '', address: '', nif: '', note: '', active: true };

export default function SupplierForm({ fournisseur, onDone, onCancel }) {
  const [values, setValues] = useState(() => (fournisseur ? { ...vide, ...fournisseur } : { ...vide }));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const maj = patch => setValues(etat => ({ ...etat, ...patch }));

  const soumettre = async event => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = { ...values, name: values.name.trim() };
      const enregistre = fournisseur
        ? await referentials.update('suppliers', fournisseur.id, payload)
        : await referentials.create('suppliers', payload);
      onDone(enregistre);
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
        <Field label="Raison sociale"><Input value={values.name} onChange={e => maj({ name: e.target.value })} required /></Field>
        <Field label="Personne à contacter"><Input value={values.contact} onChange={e => maj({ contact: e.target.value })} /></Field>
        <Field label="Téléphone"><Input value={values.phone} onChange={e => maj({ phone: e.target.value })} /></Field>
        <Field label="E-mail"><Input type="email" value={values.email} onChange={e => maj({ email: e.target.value })} /></Field>
        <Field label="NIF / numéro fiscal"><Input value={values.nif} onChange={e => maj({ nif: e.target.value })} /></Field>
      </div>
      <Field label="Adresse"><Textarea value={values.address} onChange={e => maj({ address: e.target.value })} /></Field>
      <Field label="Note"><Textarea value={values.note} onChange={e => maj({ note: e.target.value })} placeholder="Délais de livraison, conditions de paiement…" /></Field>
      <Check label="Fournisseur actif" checked={values.active} onChange={e => maj({ active: e.target.checked })} />
      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <Btn variant="ghost" onClick={onCancel}>Renoncer</Btn>
        <Btn variant="primary" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Btn>
      </div>
    </form>
  );
}
