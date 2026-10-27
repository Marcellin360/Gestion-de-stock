// Fiche fournisseur (grossiste, laboratoire, distributeur).
//
// Deux règles voulues par l'officine :
//   • à la CRÉATION, la « Raison sociale » n'est plus demandée : le serveur donne
//     un nom au fournisseur (personne à contacter, sinon téléphone, sinon
//     « Fournisseur 4 »). On peut le corriger ensuite avec le crayon (Modifier) ;
//   • le formulaire n'envoie QUE les champs attendus par le serveur : l'enregistrer
//     avec l'objet complet venait auparavant avec « id » et « createdAt », et la
//     modification était refusée (« champ inconnu »).
// 2.7.78 — la bannière bleue « Plus de « Raison sociale » à saisir » est
// RETIRÉE du formulaire de création (demande de l'officine). Le comportement,
// lui, ne change pas : à la création le serveur nomme toujours le fournisseur
// tout seul (personne à contacter, sinon téléphone, sinon « Fournisseur N »).
import { useState } from 'react';
import { referentials } from '../api/endpoints.js';
import { Btn, Check, ErrorBox, Field, Input, Textarea } from '../components/ui.jsx';

const vide = { name: '', contact: '', phone: '', email: '', address: '', nif: '', note: '', active: true };

export default function SupplierForm({ fournisseur, onDone, onCancel }) {
  const [values, setValues] = useState(() => (fournisseur ? {
    ...vide,
    name: fournisseur.name || '',
    contact: fournisseur.contact || '',
    phone: fournisseur.phone || '',
    email: fournisseur.email || '',
    address: fournisseur.address || '',
    nif: fournisseur.nif || '',
    note: fournisseur.note || '',
    active: Boolean(fournisseur.active)
  } : { ...vide }));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const maj = patch => setValues(etat => ({ ...etat, ...patch }));

  const soumettre = async event => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        contact: values.contact || '',
        phone: values.phone || '',
        email: values.email || '',
        address: values.address || '',
        nif: values.nif || '',
        note: values.note || '',
        active: Boolean(values.active)
      };
      // Le nom n'est envoyé que s'il est saisi (création sans raison sociale,
      // ou correction depuis la fiche « Modifier »).
      if (values.name.trim()) payload.name = values.name.trim();
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

      {/* 2.7.78 — à la CRÉATION, plus de bannière ni de case : la fiche part
          directement sur les coordonnées, et le serveur attribue le nom.
          En MODIFICATION, la raison sociale reste corrigeable. */}
      {fournisseur ? (
        <Field label="Raison sociale" hint="Vous pouvez la corriger ici : c’est le nom affiché dans la liste et dans les rapports d’achat.">
          <Input value={values.name} onChange={e => maj({ name: e.target.value })} />
        </Field>
      ) : null}

      <div className="grid grid--2">
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