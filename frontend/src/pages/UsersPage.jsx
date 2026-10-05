// Comptes et droits : création, modification, désactivation. Le dernier
// administrateur actif ne peut jamais être retiré (garde-fou côté serveur).
import { useEffect, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
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
                <td className="right"><Btn variant="ghost" icon={Pencil} onClick={() => setEdition(compte)} aria-label="Modifier" /></td>
              </tr>
            ))}
          </Table>
        )}
        <p className="muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
          Un compte n’est jamais supprimé : il est désactivé, ce qui ferme immédiatement ses sessions ouvertes.
        </p>
      </Card>

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