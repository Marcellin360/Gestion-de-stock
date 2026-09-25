// Inventaire physique : on ouvre une session, on saisit les comptages, chaque
// écart doit être justifié (RG17) ; la validation crée un ajustement tracé.
import { useState } from 'react';
import { ClipboardCheck, Printer, Play, Ban } from 'lucide-react';
import { stock } from '../api/endpoints.js';
import { newRequestKey, openPrintable } from '../api/client.js';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Input, Modal, Select, StatusBadge, Textarea } from '../components/ui.jsx';
import { LOCATION_SHORT, dateTime, integer, money, monthStart, today } from '../utils/format.js';

const STATUS_LABELS = { DRAFT: 'En cours', VALIDATED: 'Validé', ABANDONED: 'Abandonné' };

export default function InventoriesPage() {
  const { inventories, productName, refresh } = useData();
  const { can, user } = useAuth();
  const toast = useToast();
  const [ouverture, setOuverture] = useState(false);
  // Un inventaire se fait magasin par magasin : la réserve et le comptoir se
  // comptent séparément (chacun a sa fiche de stock).
  const [nouveau, setNouveau] = useState({
    location: user?.roleCode === 'DEPOT' ? 'DEPOT' : 'PHARMACY',
    scope: 'Officine complète', note: ''
  });
  const [comptage, setComptage] = useState(null);
  const [lignes, setLignes] = useState([]);
  const [annulation, setAnnulation] = useState(null);
  const [motif, setMotif] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const ouvrir = async () => {
    setBusy(true);
    setError(null);
    try {
      const inventaire = await stock.openInventory(nouveau);
      toast.success(`Inventaire ${inventaire.reference} ouvert (${LOCATION_SHORT[nouveau.location]}) : `
        + `${inventaire.linesCount} lot(s) à compter.`);
      setOuverture(false);
      setNouveau({ location: nouveau.location, scope: 'Officine complète', note: '' });
      await charger(inventaire.id);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const charger = async id => {
    setError(null);
    try {
      const detail = await stock.inventory(id);
      setComptage(detail);
      setLignes(detail.lines.map(ligne => ({
        id: ligne.id,
        productId: ligne.productId,
        lotId: ligne.lotId,
        theoretical: Number(ligne.theoretical),
        physical: ligne.physical === null || ligne.physical === undefined ? '' : Number(ligne.physical),
        reason: ligne.reason || ''
      })));
    } catch (cause) {
      setError(cause);
    }
  };

  const valider = async () => {
    setBusy(true);
    setError(null);
    try {
      const reponse = await stock.validateInventory(comptage.id, {
        requestKey: newRequestKey(),
        note: comptage.note || '',
        lines: lignes.map(ligne => ({ id: ligne.id, physical: Number(ligne.physical), reason: ligne.reason }))
      });
      toast.success('Inventaire validé : les écarts justifiés ont ajusté le stock.');
      setComptage(null);
      await refresh();
      return reponse;
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const abandonner = async () => {
    setBusy(true);
    setError(null);
    try {
      await stock.abandonInventory(annulation.id, motif);
      toast.warn('Inventaire abandonné : aucun mouvement de stock créé.');
      setAnnulation(null);
      setMotif('');
      setComptage(null);
      await refresh();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const ecarts = lignes.filter(ligne => ligne.physical !== '' && Number(ligne.physical) !== ligne.theoretical);
  const sansMotif = ecarts.filter(ligne => (ligne.reason || '').trim().length < 3);

  return (
    <>
      <Card title={`${inventories.length} session(s) d’inventaire`}
        actions={<>
          {/* §9.13 : la fiche de la période (stock initial, entrées, sorties, stock final théorique) */}
          {can('reports') ? (
            <Btn variant="ghost" icon={Printer}
              onClick={() => openPrintable(`/reports/print?type=fiche&from=${monthStart()}&to=${today()}`)}>
              Fiche de stock du mois
            </Btn>
          ) : null}
          <Btn variant="primary" icon={ClipboardCheck} onClick={() => setOuverture(true)}>Ouvrir un inventaire</Btn>
        </>}>
        {inventories.length === 0 ? <Empty>Aucun inventaire enregistré pour le moment.</Empty> : (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Référence</th><th>Magasin</th><th>Périmètre</th><th>État</th><th className="num">Lots comptés</th><th>Ouvert le</th><th>Validé le</th><th /></tr></thead>
              <tbody>
                {inventories.map(inventaire => (
                  <tr key={inventaire.id}>
                    <td><strong>{inventaire.reference}</strong></td>
                    <td><Badge tone={inventaire.location === 'DEPOT' ? 'info' : 'default'}>{LOCATION_SHORT[inventaire.location] || '—'}</Badge></td>
                    <td className="wrap">{inventaire.scope || 'Officine complète'}</td>
                    <td><StatusBadge status={inventaire.status} labels={STATUS_LABELS} /></td>
                    <td className="num">{integer(inventaire.linesCount)}</td>
                    <td>{dateTime(inventaire.createdAt)}</td>
                    <td>{inventaire.validatedAt ? dateTime(inventaire.validatedAt) : '—'}</td>
                    <td className="right nowrap">
                      {inventaire.status === 'DRAFT' ? (
                        <Btn icon={Play} onClick={() => charger(inventaire.id)}>Compter</Btn>
                      ) : (
                        <Btn variant="ghost" icon={Printer} onClick={() => openPrintable(`/inventories/${inventaire.id}/print`)}>Feuille</Btn>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {ouverture ? (
        <Modal title="Ouvrir une session d’inventaire" onClose={() => { setOuverture(false); setError(null); }}
          footer={<>
            <Btn variant="ghost" onClick={() => setOuverture(false)}>Renoncer</Btn>
            <Btn variant="primary" onClick={ouvrir} disabled={busy}>Ouvrir et compter</Btn>
          </>}>
          <ErrorBox error={error} />
          <p>Le système fige le stock théorique de chaque lot du magasin choisi à cet instant. Aucun mouvement n’est créé tant que vous n’avez pas validé.</p>
            {user?.roleCode === 'DEPOT' ? (
            <Field label="Magasin à compter" hint="Votre profil travaille sur la réserve : l’inventaire se fait au dépôt.">
              <Input value="Dépôt (réserve)" readOnly />
            </Field>
          ) : (
            <Field label="Magasin à compter" hint="Un inventaire par magasin : la réserve et le comptoir se comptent séparément">
              <Select value={nouveau.location} onChange={e => setNouveau({ ...nouveau, location: e.target.value })}>
                <option value="PHARMACY">Pharmacie (comptoir)</option>
                <option value="DEPOT">Dépôt (réserve)</option>
              </Select>
            </Field>
          )}
          <Field label="Périmètre compté" hint="Par exemple : rayon comptoir, réserve, armoire à stupéfiants">
            <Input value={nouveau.scope} onChange={e => setNouveau({ ...nouveau, scope: e.target.value })} />
          </Field>
          <Field label="Remarque (facultative)">
            <Textarea value={nouveau.note} onChange={e => setNouveau({ ...nouveau, note: e.target.value })} />
          </Field>
        </Modal>
      ) : null}

      {comptage ? (
        <Modal title={`Comptage — ${comptage.reference} (${LOCATION_SHORT[comptage.location] || 'magasin'})`}
          onClose={() => setComptage(null)} wide
          footer={<>
            <Btn variant="ghost" onClick={() => setAnnulation(comptage)} icon={Ban}>Abandonner</Btn>
            <div className="spacer" />
            <Btn variant="primary" icon={ClipboardCheck} onClick={valider} disabled={busy || sansMotif.length > 0}>
              {busy ? 'Validation…' : `Valider l’inventaire (${ecarts.length} écart(s))`}
            </Btn>
          </>}>
          <ErrorBox error={error} />
          {sansMotif.length ? (
            <div className="banner banner--warn">
              {sansMotif.length} écart(s) sans justification : indiquez un motif d’au moins 3 caractères pour chaque lot dont le comptage diffère du stock théorique.
            </div>
          ) : null}
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Médicament</th><th>Lot</th><th className="num">Théorique</th><th className="num">Compté</th><th className="num">Écart</th><th>Justification</th></tr></thead>
              <tbody>
                {lignes.map((ligne, index) => {
                  const ecart = ligne.physical === '' ? null : Number(ligne.physical) - ligne.theoretical;
                  return (
                    <tr key={ligne.id} style={ecart ? { background: '#fdf1dd' } : undefined}>
                      <td className="wrap">{productName(ligne.productId)}</td>
                      <td>{ligne.lotId}</td>
                      <td className="num">{integer(ligne.theoretical)}</td>
                      <td className="num" style={{ minWidth: 110 }}>
                        <Input type="number" min="0" step="1" value={ligne.physical}
                          onChange={e => {
                            const copie = [...lignes];
                            copie[index] = { ...ligne, physical: e.target.value };
                            setLignes(copie);
                          }} />
                      </td>
                      <td className="num">{ecart === null ? '—' : `${ecart > 0 ? '+' : ''}${integer(ecart)}`}</td>
                      <td className="wrap" style={{ minWidth: 220 }}>
                        <Input value={ligne.reason}
                          placeholder={ecart ? 'Motif obligatoire' : 'Facultatif'}
                          onChange={e => {
                            const copie = [...lignes];
                            copie[index] = { ...ligne, reason: e.target.value };
                            setLignes(copie);
                          }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <Btn variant="ghost" onClick={() => setLignes(lignes.map(ligne => ({ ...ligne, physical: ligne.theoretical })))}>
              Tout conforme
            </Btn>
            <span className="muted">Utilisez cette commande si le comptage confirme le stock théorique.</span>
          </div>
        </Modal>
      ) : null}

      {annulation ? (
        <Modal title="Abandonner cet inventaire" onClose={() => { setAnnulation(null); setError(null); }}
          footer={<>
            <Btn variant="ghost" onClick={() => setAnnulation(null)}>Renoncer</Btn>
            <Btn variant="danger" onClick={abandonner} disabled={busy || motif.trim().length < 3}>Abandonner</Btn>
          </>}>
          <ErrorBox error={error} />
          <p>Le comptage est conservé au journal, mais aucun ajustement de stock n’est appliqué.</p>
          <Field label="Motif (3 caractères minimum)">
            <Textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ex. : erreur de comptage, session interrompue…" />
          </Field>
        </Modal>
      ) : null}
    </>
  );
}
