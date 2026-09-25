// Journal d'audit : qui a fait quoi, quand. Aucune donnée sensible n'y figure
// (ni mot de passe, ni jeton de session).
import { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { reports } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Banner, Btn, Card, Empty, ErrorBox, Spinner, Table } from '../components/ui.jsx';
import { absolute } from '../utils/format.js';

export default function AuditPage() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [resultat, setResultat] = useState(null);
  const [integrite, setIntegrite] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const charger = async () => {
    setBusy(true);
    setError(null);
    try {
      setResultat(await reports.audit(page));
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [page]);

  const controler = async () => {
    try {
      const reponse = await reports.integrity();
      setIntegrite(reponse);
      toast[reponse.ok ? 'success' : 'warn'](reponse.ok
        ? 'Contrôle d’intégrité : stock cohérent avec les mouvements.'
        : `${reponse.anomalies.length} anomalie(s) à examiner.`);
    } catch (cause) {
      toast.error(cause.message);
    }
  };

  const total = resultat?.count || 0;
  const pages = Math.max(1, Math.ceil(total / (resultat?.limit || 100)));

  return (
    <>
      <Card title={`Journal d’audit — ${total} entrée(s)`}
        actions={<>
          <Btn variant="ghost" icon={RefreshCw} onClick={charger} disabled={busy}>Rafraîchir</Btn>
          <Btn variant="ghost" icon={ShieldCheck} onClick={controler}>Contrôle d’intégrité</Btn>
        </>}>
        <ErrorBox error={error} />
        {integrite ? (
          <Banner tone={integrite.ok ? 'ok' : 'error'} title={integrite.ok ? 'Aucune anomalie' : `${integrite.anomalies.length} anomalie(s)`}>
            {integrite.ok ? 'Chaque lot correspond exactement à la somme de ses mouvements.' : null}
          </Banner>
        ) : null}

        {busy && !resultat ? <Spinner page /> : !resultat?.rows?.length ? <Empty>Journal vide.</Empty> : (
          <>
            <Table columns={[
              { label: '# ' }, { label: 'Horodatage (UTC)' }, { label: 'Utilisateur' },
              { label: 'Action' }, { label: 'Objet' }, { label: 'Référence' }
            ]}>
              {resultat.rows.map(entree => (
                <tr key={entree.id}>
                  <td>{entree.id}</td>
                  <td>{absolute(entree.createdAt)}</td>
                  <td>{(entree.author?.name) || `Utilisateur #${entree.userId ?? '—'}`}</td>
                  <td><Badge tone={entree.action === 'CANCEL' ? 'danger' : entree.action === 'UPDATE' ? 'warn' : 'info'}>{entree.action}</Badge></td>
                  <td>{entree.entity}{entree.entityId ? ` #${entree.entityId}` : ''}</td>
                  <td className="wrap">{entree.after?.reference || entree.before?.reference || '—'}</td>
                </tr>
              ))}
            </Table>
            <div className="row" style={{ marginTop: 12 }}>
              <Btn variant="ghost" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</Btn>
              <span className="muted">Page {page} / {pages}</span>
              <Btn variant="ghost" icon={ChevronRight} disabled={page >= pages} onClick={() => setPage(page + 1)}>Suivant</Btn>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
