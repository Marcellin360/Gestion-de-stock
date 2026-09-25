// Journal d'audit (§9.18) et contrôles d'intégrité.
import { read } from '../utils/transaction.js';
import { list } from '../services/audit.service.js';
import { integrityReport } from '../services/stock.service.js';

export async function logs(req, res) {
  res.json(await read(transaction => list({ page: Number(req.query.page || 1), limit: 100 }, transaction)));
}

/** Contrôle d'intégrité : stock du lot = somme des mouvements (§12). */
export async function integrity(req, res) {
  const anomalies = await read(transaction => integrityReport(transaction));
  res.json({ anomalies, ok: anomalies.length === 0 });
}
