// Rapports : dix états sur une période, export CSV compatible Excel, version
// imprimable et contrôle d'intégrité du stock.
import { useEffect, useMemo, useState } from 'react';
import { Download, Printer, FileBarChart, RefreshCw, ShieldCheck } from 'lucide-react';
import { reports } from '../api/endpoints.js';
import { downloadCsv, openPrintable } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { Badge, Banner, Btn, Card, Empty, ErrorBox, Field, Input, Select, Spinner, Table } from '../components/ui.jsx';
import { addDays, integer, monthStart, money, today } from '../utils/format.js';

const TYPES = [
  // Les deux fiches de stock : le registre du comptoir et celui de la réserve (§9.13).
  { code: 'fiche', label: 'Fiche de stock — PHARMACIE (initial · entrées · sorties · final)' },
  { code: 'fiche_depot', label: 'Fiche de stock — DÉPÔT (initial · entrées · sorties · final)' },
  { code: 'stock', label: 'État du stock (par magasin)' },
  { code: 'movements', label: 'Mouvements de stock' },
  { code: 'transfers', label: 'Transferts dépôt → pharmacie' },
  { code: 'sales', label: 'Ventes et marges (pharmacie)' },
  { code: 'receipts', label: 'Achats et réceptions (dépôt)' },
  { code: 'losses', label: 'Pertes et dons' },
  { code: 'expirations', label: 'Lots à surveiller (les deux magasins)' },
  { code: 'inventories', label: 'Inventaires et écarts' },
  { code: 'prices', label: 'Historique des prix' },
  { code: 'suppliers', label: 'Achats par fournisseur' }
];

// Rapports qui acceptent un filtre de magasin (les fiches ont le leur d'office).
const AVEC_MAGASIN = ['stock', 'movements', 'losses', 'expirations', 'inventories'];

export default function ReportsPage() {
  const toast = useToast();
  const { can } = useAuth();
  const { suppliers } = useData();
  const [filtres, setFiltres] = useState({ type: 'fiche', from: monthStart(), to: today(), location: '' });
  const [supplierId, setSupplierId] = useState('');
  const [resultat, setResultat] = useState(null);
  const [integrite, setIntegrite] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const charger = async () => {
    setBusy(true);
    setError(null);
    try {
      setResultat(await reports.load({ ...filtres, supplierId: supplierId || undefined }));
    } catch (cause) {
      setError(cause);
      setResultat(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [filtres]);

  const colonnes = useMemo(() => (resultat?.rows?.length ? Object.keys(resultat.rows[0]) : []), [resultat]);
  const libelle = TYPES.find(type => type.code === filtres.type)?.label || 'Rapport';

  const exporter = async () => {
    try {
      await downloadCsv(`/reports?${reports.queryString({ ...filtres, supplierId: supplierId || undefined })}&format=csv`,
        `${filtres.type}-${filtres.from}-${filtres.to}.csv`);
    } catch (cause) {
      toast.error(cause.message);
    }
  };

  const controler = async () => {
    try {
      const reponse = await reports.integrity();
      setIntegrite(reponse);
      if (reponse.ok) toast.success('Contrôle d’intégrité : aucune anomalie détectée.');
      else toast.warn(`${reponse.anomalies.length} anomalie(s) détectée(s) : consultez le détail.`);
    } catch (cause) {
      toast.error(cause.message);
    }
  };

  return (
    <>
      <Card title="Paramètres du rapport"
        actions={<>
          <Btn variant="ghost" icon={RefreshCw} onClick={charger} disabled={busy}>Recalculer</Btn>
          {can('audit') ? <Btn variant="ghost" icon={ShieldCheck} onClick={controler}>Contrôle d’intégrité</Btn> : null}
        </>}>
        <div className="inline-form">
          <Field label="Rapport">
            <Select value={filtres.type} onChange={e => setFiltres({ ...filtres, type: e.target.value })}>
              {TYPES.map(type => <option key={type.code} value={type.code}>{type.label}</option>)}
            </Select>
          </Field>
          <Field label="Du"><Input type="date" value={filtres.from} onChange={e => setFiltres({ ...filtres, from: e.target.value })} /></Field>
          <Field label="Au"><Input type="date" value={filtres.to} onChange={e => setFiltres({ ...filtres, to: e.target.value })} /></Field>
          <div className="row row--tight">
            <Btn variant="ghost" onClick={() => setFiltres({ ...filtres, from: today(), to: today() })}>Aujourd’hui</Btn>
            <Btn variant="ghost" onClick={() => setFiltres({ ...filtres, from: addDays(-7), to: today() })}>7 jours</Btn>
            <Btn variant="ghost" onClick={() => setFiltres({ ...filtres, from: monthStart(), to: today() })}>Ce mois</Btn>
          </div>
        </div>
        {['suppliers', 'receipts', 'expirations', 'stock'].includes(filtres.type) ? (
          <Field label="Fournisseur (facultatif)">
            <Select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">Tous les fournisseurs</option>
              {suppliers.map(fournisseur => (
                <option key={fournisseur.id} value={fournisseur.id}>{fournisseur.name}</option>
              ))}
            </Select>
          </Field>
        ) : null}
      </Card>

      {integrite ? (
        <Banner tone={integrite.ok ? 'ok' : 'error'} title={integrite.ok ? 'Stock cohérent : lot = somme des mouvements' : 'Anomalies détectées'}>
          {integrite.ok ? `Contrôle effectué sur l’ensemble des lots (${today()}).` : (
            <ul>{integrite.anomalies.slice(0, 20).map((anomalie, index) => <li key={index}>{JSON.stringify(anomalie)}</li>)}</ul>
          )}
        </Banner>
      ) : null}

      {error ? <ErrorBox error={error} /> : null}

      {resultat?.totals ? (
        <Banner tone="info" title={`Totaux de la fiche — ${resultat.locationLabel || ''}`}>
          Stock initial : {integer(resultat.totals.initial)} · Entrées : {integer(resultat.totals.entrees)}
          {' '}· Sorties : {integer(resultat.totals.sorties)} · Stock final : {integer(resultat.totals.final)}
          {' '}· Valeur : {money(resultat.totals.valeur)}
        </Banner>
      ) : null}

      {AVEC_MAGASIN.includes(filtres.type) ? (
        <Card title="Magasin">
          <div className="inline-form">
            <Field label="Filtrer sur un magasin"
              hint="Le dépôt et la pharmacie ont chacun leur stock : leurs chiffres ne se mélangent pas.">
              <Select value={filtres.location} onChange={e => setFiltres({ ...filtres, location: e.target.value })}>
                <option value="">Tous les magasins (colonne « Magasin »)</option>
                <option value="DEPOT">Dépôt (réserve)</option>
                <option value="PHARMACY">Pharmacie (comptoir)</option>
              </Select>
            </Field>
          </div>
        </Card>
      ) : null}

      <Card title={`${libelle} — ${resultat?.rows?.length ?? 0} ligne(s)`}
        actions={<>
          {resultat?.summary ? <Badge tone="info">{Object.entries(resultat.summary).slice(0, 3).map(([cle, valeur]) => `${cle} : ${valeur}`).join(' · ')}</Badge> : null}
          <Btn icon={Download} onClick={exporter} disabled={!resultat?.rows?.length}>Export CSV</Btn>
          <Btn icon={Printer} onClick={() => openPrintable(`/reports/print?${reports.queryString({ ...filtres, supplierId: supplierId || undefined })}`)}>Imprimer</Btn>
        </>} flush>
        {busy ? <Spinner page /> : !resultat?.rows?.length ? (
          <Empty><FileBarChart size={22} /> Aucune donnée sur cette période.</Empty>
        ) : (
          <Table columns={colonnes.map((colonne, index) => ({ label: colonne, num: index > 0 && !Number.isNaN(Number(resultat.rows[0][colonne])) }))}>
            {resultat.rows.map((ligne, index) => (
              <tr key={index}>
                {colonnes.map(colonne => (
                  <td key={colonne} className={!Number.isNaN(Number(ligne[colonne])) && ligne[colonne] !== '' ? 'num' : 'wrap'}>
                    {colonne.match(/total|montant|valeur|prix|marge|cout|coût/i)
                      ? money(ligne[colonne])
                      : typeof ligne[colonne] === 'number' ? integer(ligne[colonne]) : String(ligne[colonne] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
