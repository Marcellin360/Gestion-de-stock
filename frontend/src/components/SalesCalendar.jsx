// ============================================================================
// 2.7.17 — CALENDRIER DES VENTES (tableau de bord de la PHARMACIE).
//
// Tanjona : hanaraha-maso ny varotra rehetra sy ny vola miditra isan'andro —
// le calendrier affiche chaque jour du mois avec le total encaissé et le
// nombre de ventes ; en cliquant une date, le détail complet de la journée
// apparaît (heure, référence, client, articles, montant, marge).
//
// Deux lectures serveur, légères toutes les deux :
//   • GET /api/data/sales-calendar?month=AAAA-MM  → agrégat jour par jour ;
//   • GET /api/reports?type=sales&from=JJ&to=JJ   → lignes du jour cliqué.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { dashboard, reports } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, Spinner } from './ui.jsx';
import { integer, money, today } from '../utils/format.js';

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const NOMS_JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

/** Libelle le suivi : « 3 · 45 000 Ar » dans la case du jour. */
const texteJour = info => `${integer(info.count)} vente${info.count > 1 ? 's' : ''} · ${money(info.total)}`;

export default function SalesCalendar() {
  const toast = useToast();
  // Mois affiché (AAAA-MM) ; on démarre sur le mois courant, jour = aujourd'hui.
  const [mois, setMois] = useState(() => today().slice(0, 7));
  const [jours, setJours] = useState([]);        // agrégat du mois [{date,count,total,margin}]
  const [jourChoisi, setJourChoisi] = useState(today());  // AAAA-MM-JJ
  const [lignes, setLignes] = useState(null);    // lignes de vente du jour choisi
  const [busy, setBusy] = useState(false);

  const changerMois = decalage => {
    const [annee, m] = mois.split('-').map(Number);
    const total = (annee * 12 + (m - 1)) + decalage;
    const a = Math.floor(total / 12);
    const mm = ((total % 12) + 12) % 12 + 1;
    const nouveau = `${a}-${String(mm).padStart(2, '0')}`;
    setMois(nouveau);
    // On ne peut pas dépasser le mois courant (pas de vente future à suivre).
    const plafond = today().slice(0, 7);
    setJourChoisi(nouveau === plafond ? today() : null);
    setLignes(null);
  };

  // ── Agrégat du mois : une requête par changement de mois ──────────────────
  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const reponse = await dashboard.salesCalendar(mois);
        if (vivant) setJours(reponse.days || []);
      } catch (cause) {
        if (vivant) toast.error(cause.message);
      }
    })();
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mois]);

  // ── Détail du jour cliqué : les lignes de vente de cette date ─────────────
  useEffect(() => {
    if (!jourChoisi) return undefined;
    let vivant = true;
    setBusy(true);
    (async () => {
      try {
        const reponse = await reports.load({ type: 'sales', from: jourChoisi, to: jourChoisi });
        if (vivant) setLignes(reponse.rows || []);
      } catch (cause) {
        if (vivant) toast.error(cause.message);
      } finally {
        if (vivant) setBusy(false);
      }
    })();
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jourChoisi]);

  // Deux index utiles : info par date, et le total du mois affiché.
  const parJour = useMemo(() => new Map(jours.map(jour => [jour.date, jour])), [jours]);
  const totalMois = useMemo(() => jours.reduce((acc, jour) => ({
    count: acc.count + Number(jour.count),
    total: acc.total + Number(jour.total),
    margin: acc.margin + Number(jour.margin)
  }), { count: 0, total: 0, margin: 0 }), [jours]);

  // La grille : blancs de départ (le mois commence un lundi = 0 décalage) + jours.
  const cases = useMemo(() => {
    const [annee, m] = mois.split('-').map(Number);
    const nbJours = new Date(annee, m, 0).getDate();
    const decalage = (new Date(annee, m - 1, 1).getDay() + 6) % 7;
    return [...Array(decalage).fill(null), ...Array.from({ length: nbJours }, (_, i) => i + 1)];
  }, [mois]);

  // Les ventes du jour, regroupées par référence (une vente = un ticket).
  const ventesDuJour = useMemo(() => {
    if (!lignes) return [];
    const ordre = [];
    const regroupe = new Map();
    for (const ligne of lignes) {
      if (!regroupe.has(ligne['Référence'])) {
        regroupe.set(ligne['Référence'], { reference: ligne['Référence'],
          heure: ligne.Date, client: ligne.Client, vendeur: ligne['Servi par'], lignes: [] });
        ordre.push(ligne['Référence']);
      }
      regroupe.get(ligne['Référence']).lignes.push(ligne);
    }
    // Chaque ticket : total = quantité × prix unitaire, marge = somme des marges.
    return ordre.map(reference => {
      const vente = regroupe.get(reference);
      vente.total = vente.lignes.reduce((acc, ligne) =>
        acc + Number(ligne['Quantité'] || 0) * Number(ligne['Prix unitaire (Ar)'] || 0), 0);
      vente.marge = vente.lignes.reduce((acc, ligne) => acc + Number(ligne['Marge (Ar)'] || 0), 0);
      return vente;
    });
  }, [lignes]);
  const totalDuJour = useMemo(() => ventesDuJour.reduce((acc, vente) => ({
    total: acc.total + vente.total, marge: acc.marge + vente.marge
  }), { total: 0, marge: 0 }), [ventesDuJour]);

  const [anneeM, moisM] = mois.split('-').map(Number);
  const infoJour = jourChoisi ? parJour.get(jourChoisi) : null;

  return (
    <Card
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CalendarDays size={18} /> Calendrier des ventes — {NOMS_MOIS[moisM - 1]} {anneeM}
      </span>}
      actions={<>
        <Badge tone="info">{integer(totalMois.count)} vente(s) · {money(totalMois.total)}</Badge>
        <Btn variant="ghost" size="sm" icon={ChevronLeft} onClick={() => changerMois(-1)}
          title="Mois précédent" aria-label="Mois précédent" />
        <Btn variant="ghost" size="sm" icon={ChevronRight} onClick={() => changerMois(1)}
          disabled={mois >= today().slice(0, 7)} title="Mois suivant" aria-label="Mois suivant" />
      </>}>

      {/* Grille du mois : chaque case = un jour, avec son total encaissé. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))',
        gap: 4, marginBottom: 14
      }}>
        {NOMS_JOURS.map(nom => (
          <div key={nom} className="muted"
            style={{ textAlign: 'center', fontSize: '.75rem', textTransform: 'uppercase' }}>{nom}</div>
        ))}
        {cases.map((jour, index) => {
          if (jour === null) return <div key={`vide-${index}`} />;
          const iso = `${mois}-${String(jour).padStart(2, '0')}`;
          const info = parJour.get(iso);
          const estChoisi = iso === jourChoisi;
          return (
            <button key={iso} type="button" onClick={() => setJourChoisi(iso)}
              title={info ? texteJour(info) : 'Aucune vente'}
              style={{
                all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
                border: `1px solid ${estChoisi ? 'var(--primary, #2563eb)' : 'var(--line, #e2e8f0)'}`,
                borderRadius: 8, padding: '5px 6px', minHeight: 52, textAlign: 'left',
                background: estChoisi ? 'var(--primary-soft, #eff6ff)' : info ? 'var(--ok-soft, #f0fdf4)' : 'transparent',
                outline: estChoisi ? '2px solid var(--primary, #2563eb)' : 'none'
              }}>
              <div style={{ fontWeight: estChoisi ? 700 : 500, fontSize: '.85rem' }}>{jour}</div>
              {info ? (
                <div style={{ fontSize: '.68rem', lineHeight: 1.25, color: 'var(--ok, #15803d)' }}>
                  <strong>{integer(info.count)} vente{info.count > 1 ? 's' : ''}</strong>
                  <br />{money(info.total)}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Détail du jour choisi : toutes les ventes, leurs articles et le total. */}
      {jourChoisi ? (
        <>
          <div className="row" style={{ marginBottom: 6 }}>
            <strong>
              {new Date(`${jourChoisi}T12:00:00`).toLocaleDateString('fr-FR',
                { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </strong>
            <div className="spacer" />
            {infoJour ? (
              <Badge tone="ok">
                {integer(infoJour.count)} vente(s) · encaissé {money(infoJour.total)} · marge {money(infoJour.margin)}
              </Badge>
            ) : null}
          </div>
          {busy ? <Spinner /> : ventesDuJour.length === 0 ? (
            <Empty>Aucune vente ce jour-là.</Empty>
          ) : (
            <div className="stack">
              {ventesDuJour.map(vente => (
                <div key={vente.reference}
                  style={{ border: '1px solid var(--line, #e2e8f0)', borderRadius: 8, padding: '8px 10px' }}>
                  <div className="row" style={{ fontSize: '.85rem' }}>
                    <strong>{vente.reference}</strong>
                    <span className="muted">
                      {vente.heure ? new Date(vente.heure).toLocaleTimeString('fr-FR',
                        { hour: '2-digit', minute: '2-digit' }) : '—'}
                      {vente.client ? ` · ${vente.client}` : ''} · servi par {vente.vendeur || '—'}
                    </span>
                    <div className="spacer" />
                    <strong>{money(vente.total)}</strong>
                  </div>
                  <div className="table-scroll" style={{ marginTop: 6 }}>
                    <table className="data">
                      <thead>
                        <tr><th>Médicament</th><th className="num">Quantité</th>
                          <th className="num">Prix unitaire</th><th className="num">Montant</th>
                          <th className="num">Marge</th></tr>
                      </thead>
                      <tbody>
                        {vente.lignes.map((ligne, index) => (
                          <tr key={index}>
                            <td className="wrap">{ligne['Médicament']}</td>
                            <td className="num">{integer(ligne['Quantité'])} {String(ligne.Forme || '').toLowerCase()}</td>
                            <td className="num">{money(ligne['Prix unitaire (Ar)'])}</td>
                            <td className="num">{money(Number(ligne['Quantité'] || 0) * Number(ligne['Prix unitaire (Ar)'] || 0))}</td>
                            <td className="num">{money(ligne['Marge (Ar)'])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              <div className="total-line">
                <span>Total du jour (vola miditra isan'andro)</span>
                <span>encaissé <strong>{money(totalDuJour.total)}</strong> · marge <strong>{money(totalDuJour.marge)}</strong></span>
              </div>
            </div>
          )}
        </>
      ) : (
        <Empty>Cliquez une date du calendrier pour voir les ventes de ce jour.</Empty>
      )}
    </Card>
  );
}