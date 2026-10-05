// Rapports (§9.16) : consultation paginée, export CSV et impression.
import { read } from '../utils/transaction.js';
import { buildReport, reportSummary } from '../services/report.service.js';
import { toCsv } from '../utils/csv.js';
import { getSettings } from '../services/settings.service.js';

export async function list(req, res) {
  const { type, from, to, supplierId, location, page, format } = req.query;
  const result = await read(transaction => buildReport({
    type, from, to,
    supplierId: supplierId || null,
    location: location || null,
    page: Number(page || 1),
    limit: format === 'csv' ? 20000 : 500
  }, transaction));

  if (format === 'csv') {
    // 2.7.24 — EXPORT CSV DU DÉPÔT : les quatre colonnes de découpe par prise
    // Export CSV du DÉPÔT (2.7.24 : découpe retirée ; 2.7.25 : seuil/situation
    // retirés) : les colonnes « Sorties boîte/plaquette », « Stock final
    // boîte/plaquette », « Seuil minimum » et « Situation » en sont retirées —
    // la réserve raisonne « Sorties » et « Stock final » seulement ; le CSV de
    // la pharmacie, lui, les conserve toutes (pharmacie inchangée).
    const COLONNES_RETIREES_CSV = ['Sorties boîte', 'Sorties plaquette', 'Stock final boîte', 'Stock final plaquette',
      'Seuil minimum', 'Situation'];
    const lignes = type === 'fiche_depot'
      ? result.rows.map(ligne => Object.fromEntries(
          Object.entries(ligne).filter(([colonne]) => !COLONNES_RETIREES_CSV.includes(colonne))))
      : result.rows;
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${type}-${from}-${to}.csv"`
    });
    return res.send(toCsv(lignes));
  }
  const summary = await read(transaction => reportSummary({ from, to }, transaction));
  res.json({ ...result, summary });
}

export async function printable(req, res) {
  const { type, from, to, supplierId, location } = req.query;
  const { reportHtml } = await import('../services/ticket.service.js');
  const html = await read(transaction => reportHtml({
    type, from, to, supplierId: supplierId || null, location: location || null
  }, req.user, transaction));
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
}