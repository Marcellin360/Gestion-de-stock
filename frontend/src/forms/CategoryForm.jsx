// Catégorie de médicaments : antibiotiques, antalgiques, matériel de pansement…
import { useState } from 'react';
import { referentials } from '../api/endpoints.js';
import { Btn, Check, ErrorBox, Field, Input, Textarea } from '../components/ui.jsx';

export default function CategoryForm({ categorie, onDone, onCancel }) {
  const [values, setValues] = useState(() => categorie
    ? { name: categorie.name, description: categorie.description || '', active: Boolean(categorie.active) }
    : { name: '', description: '', active: true });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const soumettre = async event => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const enregistre = categorie
        ? await referentials.update('categories', categorie.id, values)
        : await referentials.create('categories', values);
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
      <Field label="Nom de la catégorie"><Input value={values.name} onChange={e => setValues({ ...values, name: e.target.value })} required autoFocus /></Field>
      <Field label="Description"><Textarea value={values.description} onChange={e => setValues({ ...values, description: e.target.value })} /></Field>
      <Check label="Catégorie active" checked={values.active} onChange={e => setValues({ ...values, active: e.target.checked })} />
      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <Btn variant="ghost" onClick={onCancel}>Renoncer</Btn>
        <Btn variant="primary" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Btn>
      </div>
    </form>
  );
}
