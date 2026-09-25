// Écran de connexion : login + mot de passe, messages clairs, jamais de détail
// technique (l'API ne dit pas si c'est le compte ou le mot de passe qui est faux).
import { useState } from 'react';
import { Pill, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Banner, Btn, Field, Input } from '../components/ui.jsx';
import { navigate } from '../utils/router.js';

export default function LoginPage() {
  const { login } = useAuth();
  const [values, setValues] = useState({ login: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(values.login.trim(), values.password);
      navigate('tableau-de-bord');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="row" style={{ marginBottom: 14 }}>
          <Pill size={30} color="#0f766e" />
          <div>
            <h1 style={{ margin: 0 }}>PharmaStock</h1>
            <small>Gestion du stock de l’officine</small>
          </div>
        </div>

        {error ? <Banner tone="error">{error}</Banner> : null}

        <Field label="Identifiant">
          <Input value={values.login} onChange={e => setValues({ ...values, login: e.target.value })}
            autoComplete="username" autoFocus required />
        </Field>
        <Field label="Mot de passe">
          <Input type="password" value={values.password} onChange={e => setValues({ ...values, password: e.target.value })}
            autoComplete="current-password" required />
        </Field>

        <Btn variant="primary" size="lg" type="submit" icon={LogIn} disabled={busy} className="btn--block">
          {busy ? 'Vérification…' : 'Ouvrir la session'}
        </Btn>

        <p className="muted" style={{ marginTop: 14, fontSize: '.82rem' }}>
          En cas d’oubli, demandez à l’administrateur de réinitialiser votre mot de passe
          depuis l’écran Utilisateurs.
        </p>
      </form>
    </div>
  );
}
