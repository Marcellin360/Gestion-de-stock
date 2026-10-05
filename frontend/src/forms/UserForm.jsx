// Compte utilisateur : rôle et ses droits, activation, réinitialisation du mot de passe.
import { useState } from 'react';
import { users as usersApi } from '../api/endpoints.js';
import { Btn, Check, ErrorBox, Field, Input, Select, Textarea } from '../components/ui.jsx';

export default function UserForm({ utilisateur, roles, onDone, onCancel }) {
  const [values, setValues] = useState(() => utilisateur ? {
    name: utilisateur.name, login: utilisateur.login, roleId: String(utilisateur.roleId),
    active: Boolean(utilisateur.active), phone: utilisateur.phone || '', note: utilisateur.note || '', password: ''
  } : { name: '', login: '', roleId: roles[0] ? String(roles[0].id) : '', active: true, phone: '', note: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const maj = patch => setValues(etat => ({ ...etat, ...patch }));

  const soumettre = async event => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: values.name.trim(),
        login: values.login.trim(),
        roleId: Number(values.roleId),
        active: Boolean(values.active),
        phone: values.phone || '',
        note: values.note || ''
      };
      if (values.password) payload.password = values.password;
      const enregistre = utilisateur
        ? await usersApi.update(utilisateur.id, payload)
        : await usersApi.create(payload);
      onDone(enregistre);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const rolesDisponibles = roles || [];

  return (
    <form onSubmit={soumettre}>
      <ErrorBox error={error} />
      <div className="grid grid--2">
        <Field label="Nom et prénom"><Input value={values.name} onChange={e => maj({ name: e.target.value })} required /></Field>
        <Field label="Identifiant de connexion" hint="Proposé à partir du nom (initiale + nom), modifiable">
          <Input value={values.login} onChange={e => maj({ login: e.target.value })} required autoComplete="off" />
          <div style={{ marginTop: 8 }}>
            <Btn size="sm" variant="ghost" onClick={() => maj({ login: proposerIdentifiant(values.name) })}>
              Proposer un identifiant
            </Btn>
            {values.login ? <span className="muted" style={{ marginLeft: 8, fontSize: '.84rem' }}>« {values.login} »</span> : null}
          </div>
        </Field>
        <Field label="Rôle">
          {/* 2.7.25 — le nom du rôle seul, sans le nombre de droits entre parenthèses. */}
          <Select value={values.roleId} onChange={e => maj({ roleId: e.target.value })} required>
            {rolesDisponibles.map(role => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Téléphone"><Input value={values.phone} onChange={e => maj({ phone: e.target.value })} /></Field>
        {/* 2.7.25 — 4 caractères minimum (chiffres ou lettres) au lieu de 12. */}
        <Field label={utilisateur ? 'Nouveau mot de passe (laisser vide pour conserver)' : 'Mot de passe (4 caractères minimum)'}>
          <Input type="password" value={values.password} onChange={e => maj({ password: e.target.value })}
            required={!utilisateur} autoComplete="new-password" minLength={4} />
        </Field>
      </div>

      <Field label="Note"><Textarea value={values.note} onChange={e => maj({ note: e.target.value })} placeholder="Habilitations particulières, horaires…" /></Field>

      <Check label="Compte actif" checked={values.active} onChange={e => maj({ active: e.target.checked })} />

      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <Btn variant="ghost" onClick={onCancel}>Renoncer</Btn>
        <Btn variant="primary" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Btn>
      </div>
    </form>
  );
}

/** « Rasoanaivo Hery » → « h.rasoanaivo » : identifiant simple à retenir. */
function proposerIdentifiant(nom) {
  const mots = String(nom || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
  if (!mots.length) return '';
  if (mots.length === 1) return mots[0];
  return `${mots[0][0]}.${mots[mots.length - 1]}`.slice(0, 40);
}