// Comptes et droits : création, modification, désactivation. Le dernier
// administrateur actif ne peut jamais être retiré (garde-fou côté serveur).
import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { users as usersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Modal, Spinner, Table } from '../components/ui.jsx';
import UserForm from '../forms/UserForm.jsx';

export default function UsersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [liste, setListe] = useState(null);
  const [roles, setRoles] = useState([]);
  const [edition, setEdition] = useState(null);
  const [error, setError] = useState(null);
  // 2.7.29 — confirmation avant suppression définitive d'un compte.
  const [suppression, setSuppression] = useState(null);
  const [occupation, setOccupation] = useState(false);
  const [erreurSuppression, setErreurSuppression] = useState(null);

  const charger = async () => {
    setError(null);
    try {
      const [utilisateurs, roleList] = await Promise.all([usersApi.list(), usersApi.roles()]);
      setListe(utilisateurs);
      setRoles(roleList);
    } catch (cause) {
      setError(cause);
    }
  };

  useEffect(() => { charger(); }, []);

  /** Suppression définitive (2.7.29) : le serveur refuse si le compte a trace. */
  const supprimer = async () => {
    setOccupation(true);
    setErreurSuppression(null);
    try {
      await usersApi.supprimer(suppression.id);
      toast.success(`Compte « ${suppression.name} » supprimé.`);
      setSuppression(null);
      await charger();
    } catch (cause) {
      // Historique conservé (ventes, transferts…) ou dernier admin : la base
      // refuse — la phrase du serveur explique quoi faire (désactiver).
      setErreurSuppression(cause);
    } finally {
      setOccupation(false);
    }
  };

  return (
    <>
      {/* 2.7.24 — les cartes de présentation des rôles (« Administrateur —
          14 droit(s) referencereceipttransfer… », etc.) sont RETIRÉES de cette
          page : l'écran ne montre plus que la LISTE DES COMPTES (et les rôles
          servent au formulaire de création/modification). */}
      <Card title={`${liste?.length ?? 0} compte(s)`}
        actions={<Btn variant="primary" icon={Plus} onClick={() => setEdition('nouveau')}>Nouvel utilisateur</Btn>}>
        <ErrorBox error={error} />
        {liste === null ? <Spinner page /> : liste.length === 0 ? <Empty>Aucun compte enregistré.</Empty> : (
          <Table columns={[
            // 2.7.24 — colonne « Droits » retirée ; le « Rôle » s'affiche en
            // clair (compte.roleName vient du serveur — jamais « — »).
            { label: 'Nom' }, { label: 'Identifiant' }, { label: 'Rôle' },
            { label: 'Téléphone' }, { label: 'Dernière connexion' }, { label: 'État' }, { label: '' }
          ]}>
            {liste.map(compte => (
              <tr key={compte.id}>
                <td><strong>{compte.name}</strong>{compte.id === user.id ? <Badge tone="ok">vous</Badge> : null}</td>
                <td>{compte.login}</td>
                <td>{compte.roleName || '—'}</td>
                <td>{compte.phone || '—'}</td>
                <td>{compte.lastLoginAt ? new Date(compte.lastLoginAt).toLocaleString('fr-FR') : 'jamais'}</td>
                <td>{compte.active ? <Badge tone="ok">actif</Badge> : <Badge tone="danger">désactivé</Badge>}</td>
                <td className="right">
                  <Btn variant="ghost" icon={Pencil} onClick={() => setEdition(compte)} aria-label="Modifier" />
                  {/* 2.7.29 — la corbeille n'est pas proposée sur SON propre
                      compte (on ne peut pas se supprimer soi-même). */}
                  {compte.id === user.id ? null : (
                    <Btn variant="ghost" icon={Trash2} aria-label={`Supprimer ${compte.name}`}
                      onClick={() => { setErreurSuppression(null); setSuppression(compte); }} />
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
        <p className="muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
          La corbeille supprime définitivement le compte. Si l'utilisateur a enregistré
          des opérations (ventes, réceptions, transferts…), la suppression est refusée
          pour protéger le journal : désactivez le compte à la place (crayon → État).
        </p>
      </Card>

      {/* 2.7.29 — confirmation explicite avant suppression définitive. */}
      {suppression ? (
        <Modal title={`Supprimer « ${suppression.name} » ?`} onClose={() => !occupation && setSuppression(null)}
          footer={<>
            <Btn variant="ghost" onClick={() => setSuppression(null)} disabled={occupation}>Annuler</Btn>
            <Btn variant="danger" icon={Trash2} onClick={supprimer} disabled={occupation}>
              {occupation ? 'Suppression…' : 'Supprimer définitivement'}
            </Btn>
          </>}>
          <ErrorBox error={erreurSuppression} />
          <p style={{ margin: '0 0 8px' }}>
            Cette action est <strong>définitive</strong> : le compte
            « <strong>{suppression.name}</strong> » ({suppression.login} · {suppression.roleName || '—'})
            sera supprimé et ses sessions fermées immédiatement.
          </p>
          <p className="muted" style={{ fontSize: '.84rem' }}>
            Si ce compte a déjà enregistré des opérations, la suppression sera refusée
            par la base de données : il faudra alors le désactiver à la place.
          </p>
        </Modal>
      ) : null}

      {edition ? (
        <Modal title={edition === 'nouveau' ? 'Nouvel utilisateur' : `Modifier ${edition.name}`} onClose={() => setEdition(null)} wide>
          <UserForm utilisateur={edition === 'nouveau' ? null : edition} roles={roles}
            onCancel={() => setEdition(null)}
            onDone={async () => {
              toast.success('Compte enregistré.');
              setEdition(null);
              await charger();
            }} />
        </Modal>
      ) : null}
    </>
  );
}