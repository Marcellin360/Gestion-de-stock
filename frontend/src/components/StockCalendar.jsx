// ============================================================================
// 2.7.20 — CALENDRIER DES STOCK (DÉPÔT, menu dédié sous « Stock »).
//
// Même principe que le calendrier des ventes de la pharmacie, mais pour la
// RÉSERVE : chaque jour du mois montre
//   • les ENTRÉES (ny stock niditra) : nombre de réceptions validées + valeur
//     d'achat totale (Ar) ;
//   • les SORTIES vers la pharmacie : nombre de transferts validés + valeur
//     au coût (Ar).
// Cliquer une date affiche le détail des réceptions ET des transferts du jour
// (même source que les rapports « receipts » et « transfers »).
//
// Source de l'agrégat : GET /api/data/stock-calendar?month=AAAA-MM.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, PackagePlus, ArrowRightLeft } from 'lucide-react';
import { dashboard, reports } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, Spinner } from './ui.jsx';
import { integer, money, today } from '../utils/format.js';

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const NOMS_JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

export default function StockCalendar() {
  const toast = useToast();
  const [mois, setMois] = useState(() => today().slice(0, 7));
  const [jours, setJours] = useState([]);          // agrégat du mois
  const [jourChoisi, setJourChoisi] = useState(today());
  const [receptions, setReceptions] = useState(null); // lignes du jour (rapport receipts)
  const [transferts, setTransferts] = useState(null); // lignes du jour (rapport transfers)
  const [busy, setBusy] = useState(false);

  const changerMois = decalage => {
    const [annee, m] = mois.split('-').map(Number);
    const total = (annee * 12 + (m - 1)) + decalage;
    const a = Math.floor(total / 12);
    const mm = ((total % 12) + 12) % 12 + 1;
    const nouveau = `${a}-${String(mm).padStart(2, '0')}`;
    setMois(nouveau);
    const plafond = today().slice(0, 7);
    setJourChoisi(nouveau === plafond ? today() : null);
    setReceptions(null);
    setTransferts(null);
  };

  // ── Agrégat du mois ────────────────────────────────────────────────────────
  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const reponse = await dashboard.stockCalendar(mois);
        if (vivant) setJours(reponse.days || []);
      } catch (cause) {
        if (vivant) toast.error(cause.message);
      }
    })();
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mois]);

  // ── Détail du jour : réceptions + transferts validés de cette date ─────────
  useEffect(() => {
    if (!jourChoisi) return undefined;
    let vivant = true;
    setBusy(true);
    (async () => {
      try {
        const [repRec, repTra] = await Promise.all([
          reports.load({ type: 'receipts', from: jourChoisi, to: jourChoisi }),
          reports.load({ type: 'transfers', from: jourChoisi, to: jourChoisi })
        ]);
        if (vivant) {
          setReceptions(repRec.rows || []);
          setTransferts(repTra.rows || []);
        }
      } catch (cause) {
        if (vivant) toast.error(cause.message);
      } finally {
        if (vivant) setBusy(false);
      }
    })();
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jourChoisi]);

  const parJour = useMemo(() => new Map(jours.map(jour => [jour.date, jour])), [jours]);
  const totalMois = useMemo(() => jours.reduce((acc, jour) => ({
    receipts: acc.receipts + Number(jour.receipts),
    receiptsValue: acc.receiptsValue + Number(jour.receiptsValue),
    transfers: acc.transfers + Number(jour.transfers),
    transfersValue: acc.transfersValue + Number(jour.transfersValue)
  }), { receipts: 0, receiptsValue: 0, transfers: 0, transfersValue: 0 }), [jours]);

  const cases = useMemo(() => {
    const [annee, m] = mois.split('-').map(Number);
    const nbJours = new Date(annee, m, 0).getDate();
    const decalage = (new Date(annee, m - 1, 1).getDay() + 6) % 7;
    return [...Array(decalage).fill(null), ...Array.from({ length: nbJours }, (_, i) => i + 1)];
  }, [mois]);

  // Regroupement par pièce (une réception = plusieurs lignes de médicaments).
  const regrouper = (lignes, unite) => {
    if (!lignes) return [];
    const ordre = new Map();
    for (const ligne of lignes) {
      if (!ordre.has(ligne['Référence'])) ordre.set(ligne['Référence'], []);
      ordre.get(ligne['Référence']).push(ligne);
    }
    return [...ordre.entries()].map(([reference, items]) => ({
      reference, items, total: items.reduce((acc, ligne) =>
        acc + Number(ligne[unite.qte] || 0) * Number(ligne[unite.prix] || 0), 0)
    }));
  };
  const receptionsDuJour = useMemo(() =>
    regrouper(receptions, { qte: 'Quantité reçue', prix: "Prix d'achat (Ar)" }), [receptions]);
  const transfertsDuJour = useMemo(() =>
    regrouper(transferts, { qte: 'Quantité transférée', prix: 'Coût unitaire (Ar)' }), [transferts]);
  const totalRec = receptionsDuJour.reduce((acc, piece) => acc + piece.total, 0);
  const totalTra = transfertsDuJour.reduce((acc, piece) => acc + piece.total, 0);

  const [anneeM, moisM] = mois.split('-').map(Number);
  const infoJour = jourChoisi ? parJour.get(jourChoisi) : null;

  return (
    <Card
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CalendarDays size={18} /> Calendrier des stock — {NOMS_MOIS[moisM - 1]} {anneeM}
      </span>}
      actions={<>
        <Badge tone="ok">↓ {integer(totalMois.receipts)} réception(s) · {money(totalMois.receiptsValue)}</Badge>
        <Badge tone="warn">↑ {integer(totalMois.transfers)} transfert(s) · {money(totalMois.transfersValue)}</Badge>
        <Btn variant="ghost" size="sm" icon={ChevronLeft} onClick={() => changerMois(-1)}
          title="Mois précédent" aria-label="Mois précédent" />
        <Btn variant="ghost" size="sm" icon={ChevronRight} onClick={() => changerMois(1)}
          disabled={mois >= today().slice(0, 7)} title="Mois suivant" aria-label="Mois suivant" />
      </>}>

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
              title={info ? `↓ ${info.receipts} réception(s) · ↑ ${info.transfers} transfert(s)` : 'Aucun mouvement'}
              style={{
                all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
                border: `1px solid ${estChoisi ? 'var(--primary, #2563eb)' : 'var(--line, #e2e8f0)'}`,
                borderRadius: 8, padding: '5px 6px', minHeight: 56, textAlign: 'left',
                background: estChoisi ? 'var(--primary-soft, #eff6ff)' : info ? 'var(--ok-soft, #f0fdf4)' : 'transparent',
                outline: estChoisi ? '2px solid var(--primary, #2563eb)' : 'none'
              }}>
              <div style={{ fontWeight: estChoisi ? 700 : 500, fontSize: '.85rem' }}>{jour}</div>
              {info ? (
                <div style={{ fontSize: '.66rem', lineHeight: 1.3 }}>
                  {info.receipts > 0 ? (
                    <div style={{ color: 'var(--ok, #15803d)' }}>
                      ↓ {integer(info.receipts)} · {money(info.receiptsValue)}
                    </div>
                  ) : null}
                  {info.transfers > 0 ? (
                    <div style={{ color: 'var(--warn, #b45309)' }}>
                      ↑ {integer(info.transfers)} · {money(info.transfersValue)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {jourChoisi ? (
        <>
          <div className="row" style={{ marginBottom: 6 }}>
            <strong>
              {new Date(`${jourChoisi}T12:00:00`).toLocaleDateString('fr-FR',
                { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </strong>
            <div className="spacer" />
            {infoJour ? (
              <Badge tone="info">
                ↓ {money(infoJour.receiptsValue)} entré · ↑ {money(infoJour.transfersValue)} sorti
              </Badge>
            ) : null}
          </div>
          {busy ? <Spinner /> : receptionsDuJour.length + transfertsDuJour.length === 0 ? (
            <Empty>Aucune entrée ni sortie ce jour-là.</Empty>
          ) : (
            <div className="stack">
              {receptionsDuJour.length ? (
                <div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.95rem' }}>
                    <PackagePlus size={16} /> Ny stock niditra (réceptions) — {receptionsDuJour.length} pièce(s)
                  </h3>
                  {receptionsDuJour.map(piece => (
                    <div key={piece.reference}
                      style={{ border: '1px solid var(--line, #e2e8f0)', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
                      <div className="row" style={{ fontSize: '.85rem' }}>
                        <strong>{piece.reference}</strong>
                        <span className="muted">{piece.items[0]?.Fournisseur || ''}</span>
                        <div className="spacer" />
                        <strong>{money(piece.total)}</strong>
                      </div>
                      <div className="table-scroll" style={{ marginTop: 6 }}>
                        <table className="data">
                          <thead><tr><th>Médicament</th><th>Lot</th><th className="num">Quantité reçue</th>
                            <th className="num">Prix d'achat</th><th className="num">Montant</th></tr></thead>
                          <tbody>
                            {piece.items.map((ligne, index) => (
                              <tr key={index}>
                                <td className="wrap">{ligne['Médicament']}</td>
                                <td>{ligne.Lot}</td>
                                <td className="num">{integer(ligne['Quantité reçue'])}</td>
                                <td className="num">{money(ligne["Prix d'achat (Ar)"])}</td>
                                <td className="num">{money(Number(ligne['Quantité reçue'] || 0) * Number(ligne["Prix d'achat (Ar)"] || 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {transfertsDuJour.length ? (
                <div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.95rem' }}>
                    <ArrowRightLeft size={16} /> Sortie de stock nalefa any amin'ny pharmacie (transferts) — {transfertsDuJour.length} pièce(s)
                  </h3>
                  {transfertsDuJour.map(piece => (
                    <div key={piece.reference}
                      style={{ border: '1px solid var(--line, #e2e8f0)', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
                      <div className="row" style={{ fontSize: '.85rem' }}>
                        <strong>{piece.reference}</strong>
                        <span className="muted">{piece.items[0]?.Motif || ''}</span>
                        <div className="spacer" />
                        <strong>{money(piece.total)}</strong>
                      </div>
                      <div className="table-scroll" style={{ marginTop: 6 }}>
                        <table className="data">
                          <thead><tr><th>Médicament</th><th>Lot</th><th className="num">Quantité transférée</th>
                            <th className="num">Coût unitaire</th><th className="num">Valeur</th></tr></thead>
                          <tbody>
                            {piece.items.map((ligne, index) => (
                              <tr key={index}>
                                <td className="wrap">{ligne['Médicament']}</td>
                                <td>{ligne.Lot}</td>
                                <td className="num">{integer(ligne['Quantité transférée'])}</td>
                                <td className="num">{money(ligne['Coût unitaire (Ar)'])}</td>
                                <td className="num">{money(ligne['Valeur (Ar)'])}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="total-line">
                <span>Total du jour</span>
                <span>↓ entré <strong>{money(totalRec)}</strong> · ↑ sorti <strong>{money(totalTra)}</strong></span>
              </div>
            </div>
          )}
        </>
      ) : (
        <Empty>Cliquez une date du calendrier pour voir le détail des mouvements.</Empty>
      )}
    </Card>
  );
}