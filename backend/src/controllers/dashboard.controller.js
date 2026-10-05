// Données du poste de travail (une seule requête pour toute l'interface).
import { read } from '../utils/transaction.js';
import { buildData, salesCalendar, salesMonthly, stockCalendar, stockFlowMonthly } from '../services/dashboard.service.js';

export async function getData(req, res) {
  const payload = await read(transaction => buildData(
    { ...describe(req.user), roleCode: req.user.role?.code },
    transaction
  ));
  res.json(payload);
}

const describe = user => ({ id: user.id, name: user.name, login: user.login });

// 2.7.17 — calendrier des ventes (tableau de bord pharmacie) :
// GET /api/data/sales-calendar?month=AAAA-MM → totaux jour par jour du mois.
export async function getSalesCalendar(req, res) {
  const month = String(req.query.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(422).json({ message: 'Le mois attendu est au format AAAA-MM (ex. 2026-09).' });
  }
  const payload = await read(transaction => salesCalendar(month, transaction));
  res.json(payload);
}

// 2.7.18 — histogramme du tableau de bord : GET /api/data/sales-monthly
// → chiffre d'affaires / marge / nombre de ventes des 12 derniers mois.
export async function getSalesMonthly(req, res) {
  const lignes = await read(transaction => salesMonthly(transaction));
  res.json({ months: lignes });
}

// 2.7.20 — DÉPÔT.
// GET /api/data/stock-calendar?month=AAAA-MM → entrées/sorties du dépôt par jour.
export async function getStockCalendar(req, res) {
  const month = String(req.query.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(422).json({ message: 'Le mois attendu est au format AAAA-MM (ex. 2026-09).' });
  }
  const payload = await read(transaction => stockCalendar(month, transaction));
  res.json(payload);
}

// GET /api/data/stock-flow-monthly → quantités entrées/sorties du dépôt par mois (12 mois).
export async function getStockFlowMonthly(req, res) {
  const lignes = await read(transaction => stockFlowMonthly(transaction));
  res.json({ months: lignes });
}