// ============================================================================
// Onglet « Fiche de stock » de l'écran Stock — le registre du magasin.
//
// C'est exactement le registre papier de la pharmacie :
//     Catégorie · Unité · Stock initial · Entrées · Sorties · Stock final · Coût unitaire (Ar)
//
// Deux règles importantes :
//   • le STOCK INITIAL est REPORTÉ automatiquement (c'est le stock final de la
//     période précédente) : rien à ressaisir, aucun report manuel ;
//   • le profil DÉPÔT ne voit que son propre magasin — aucun chiffre de la
//     pharmacie n'apparaît ici.
//
// Les chiffres viennent du serveur (`/api/reports`) : l'écran ne calcule rien.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Printer, RefreshCw, Warehouse, ShoppingCart } from 'lucide-react';
import { reports } from '../api/endpoints.js';
import { downloadCsv, openPrintable } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Banner, Btn, Card, Check, Empty, ErrorBox, Field, Input, Select, Table } from '../components/ui.jsx';
import { addDays, integer, monthStart, money, today } from '../utils/format.js';

export default function FicheStockTab() {
  const { user } = useAuth();
  const toast = useToast();
  // Le dépôt travaille uniquement sur la réserve : son magasin est figé.
  const estDepot = user?.roleCode === 'DEPOT';
  // Les autres profils peuvent consulter la fiche des deux magasins (pharmacie par défaut).
  const [magasin, setMagasin] = useState(estDepot ? 'DEPOT' : 'PHARMACY');
  const [filtres, setFiltres] = useState({ from: monthStart(), to: today() });
  const [resultat, setResultat] = useState(null);
  // Le registre papier liste tous les médicaments ; on peut masquer ceux qui n'ont
  // eu aucun mouvement sur la période pour aller plus vite au comptoir.
  const [masquerVides, setMasquerVides] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Un type de rapport par magasin : le serveur choisit alors les bons mouvements.
  const type = magasin === 'DEPOT' ? 'fiche_depot' : 'fiche';

  const charger = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setResultat(await reports.load({ type, from: filtres.from, to: filtres.to }));
    } catch (cause) {
      setError(cause);
      setResultat(null);
    } finally {
      setBusy(false);
    }
  }, [type, filtres.from, filtres.to]);

  useEffect(() => { charger(); }, [charger]);

  const toutesLesLignes = resultat?.rows || [];
  const lignes = useMemo(() => (masquerVides
    ? toutesLesLignes.filter(ligne => Number(ligne['Stock initial'] || 0) + Number(ligne['Entrées'] || 0)
      + Number(ligne['Sorties'] || 0) + Number(ligne['Stock final'] || 0) > 0)
    : toutesLesLignes), [toutesLesLignes, masquerVides]);
  const totaux = useMemo(() => lignes.reduce((acc, ligne) => ({
    initial: acc.initial + Number(ligne['Stock initial'] || 0),
    entrees: acc.entrees + Number(ligne['Entrées'] || 0),
    sorties: acc.sorties + Number(ligne['Sorties'] || 0),
    final: acc.final + Number(ligne['Stock final'] || 0),
    valeur: acc.valeur + Number(ligne['Valeur (Ar)'] || 0)
  }), { initial: 0, entrees: 0, sorties: 0, final: 0, valeur: 0 }), [lignes]);

  const libelleMagasin = magasin === 'DEPOT' ? 'Dépôt (réserve)' : 'Pharmacie (comptoir)';

  const imprimer = () => openPrintable(`/reports/print?type=${type}&from=${filtres.from}&to=${filtres.to}`);

  const exporter = async () => {
    try {
      await downloadCsv(`/reports?type=${type}&from=${filtres.from}&to=${filtres.to}&format=csv`,
        `fiche-${magasin.toLowerCase()}-${filtres.from}-${filtres.to}.csv`);
    } catch (cause) {
      toast.error(cause.message);
    }
  };

  const moisPrecedent = () => {
    const debut = new Date(`${filtres.from}T12:00:00`);
    const premier = new Date(debut.getFullYear(), debut.getMonth() - 1, 1);
    const dernier = new Date(debut.getFullYear(), debut.getMonth(), 0);
    setFiltres({
      from: premier.toISOString().slice(0, 10),
      to: dernier.toISOString().slice(0, 10)
    });
  };

  return (
    <>
      <Card
        title={`Fiche de stock — ${libelleMagasin}`}
        actions={<>
          <Badge tone="info">{lignes.length} médicament(s)</Badge>
          <Btn variant="ghost" icon={Download} onClick={exporter} disabled={!lignes.length}>Export CSV</Btn>
          <Btn variant="ghost" icon={Printer} onClick={imprimer} disabled={!lignes.length}>Imprimer</Btn>
          <Btn icon={RefreshCw} onClick={charger} disabled={busy}>{busy ? 'Chargement…' : 'Actualiser'}</Btn>
        </>}>
        <Banner tone="info">
          Le <strong>stock initial est repris automatiquement</strong> depuis la fiche précédente : il n’y a rien
          à ressaisir. <strong>Entrées</strong> = réceptions (et retours), <strong>Sorties</strong> = transferts,
          ventes, pertes et écarts d’inventaire du magasin. <strong>Stock final</strong> = initial + entrées − sorties.
        </Banner>

        <div className="inline-form" style={{ margin: '12px 0' }}>
          {estDepot ? (
            <Field label="Magasin" hint="Votre profil travaille sur la réserve : la fiche affichée est celle du dépôt.">
              <Input value="Dépôt (réserve)" readOnly />
            </Field>
          ) : (
            <Field label="Magasin" hint="Le stock initial est repris d’une période à l’autre, magasin par magasin.">
              <Select value={magasin} onChange={e => setMagasin(e.target.value)}>
                <option value="PHARMACY">Pharmacie (comptoir)</option>
                <option value="DEPOT">Dépôt (réserve)</option>
              </Select>
            </Field>
          )}
          <Field label="Du">
            <Input type="date" value={filtres.from} onChange={e => setFiltres({ ...filtres, from: e.target.value })} />
          </Field>
          <Field label="Au">
            <Input type="date" value={filtres.to} onChange={e => setFiltres({ ...filtres, to: e.target.value })} />
          </Field>
          <Check label="Masquer les médicaments sans mouvement" checked={masquerVides}
            onChange={e => setMasquerVides(e.target.checked)} />
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <Btn size="sm" variant="ghost" onClick={() => setFiltres({ from: monthStart(), to: today() })}>Mois en cours</Btn>
            <Btn size="sm" variant="ghost" onClick={moisPrecedent}>Mois précédent</Btn>
            <Btn size="sm" variant="ghost"
              onClick={() => setFiltres({ from: addDays(-7), to: today() })}>7 derniers jours</Btn>
          </div>
        </div>

        {error ? <ErrorBox error={error} /> : null}

        {lignes.length === 0 ? (
          <Empty>Aucun médicament actif pour cette période. Changez les dates ou ajoutez une réception.</Empty>
        ) : (
          <>
            <Table columns={[
              { label: 'Code' },
              { label: 'Médicament' },
              { label: 'Catégorie' },
              { label: 'Unité' },
              { label: 'Stock initial', num: true },
              { label: 'Entrées', num: true },
              { label: 'Sorties', num: true },
              { label: 'Stock final', num: true },
              { label: 'Coût unitaire (Ar)', num: true }
            ]}>
              {lignes.map((ligne, index) => (
                <tr key={ligne.Code || index}>
                  <td>{ligne.Code}</td>
                  <td className="wrap">{ligne['Médicament']}</td>
                  <td className="wrap">{ligne['Catégorie'] || '—'}</td>
                  <td>{ligne['Unité'] || '—'}</td>
                  <td className="num">{integer(ligne['Stock initial'])}</td>
                  <td className="num">{ligne['Entrées'] ? <strong>{integer(ligne['Entrées'])}</strong> : integer(0)}</td>
                  <td className="num">{ligne['Sorties'] ? <strong>{integer(ligne['Sorties'])}</strong> : integer(0)}</td>
                  <td className="num">{integer(ligne['Stock final'])}</td>
                  <td className="num">{money(ligne['Coût unitaire (Ar)'])}</td>
                </tr>
              ))}
            </Table>

            <div className="total-line" style={{ marginTop: 10 }}>
              <span>Total du magasin</span>
              <span>
                initial <strong>{integer(totaux.initial)}</strong> ·
                entrées <strong>{integer(totaux.entrees)}</strong> ·
                sorties <strong>{integer(totaux.sorties)}</strong> ·
                stock final <strong>{integer(totaux.final)}</strong>
              </span>
            </div>
            <div className="total-line muted">
              <span>Valeur du stock final ({magasin === 'DEPOT' ? 'dépôt' : 'pharmacie'})</span>
              <span>{money(totaux.valeur)}</span>
            </div>
          </>
        )}

        <p className="muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
          Période affichée : du {new Date(`${filtres.from}T12:00:00`).toLocaleDateString('fr-FR')} au{' '}
          {new Date(`${filtres.to}T12:00:00`).toLocaleDateString('fr-FR')}. Les mouvements déjà passés
          (avant le {new Date(`${filtres.from}T12:00:00`).toLocaleDateString('fr-FR')}) sont résumés par le stock initial.
          {' '}Magasin de cette fiche : {magasin === 'DEPOT' ? <><Warehouse size={14} /> Dépôt (réserve)</> : <><ShoppingCart size={14} /> Pharmacie (comptoir)</>}.
        </p>
      </Card>
    </>
  );
}