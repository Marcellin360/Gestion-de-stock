// Transferts dépôt → pharmacie : création, liste, détail, lots disponibles.
import { read, write } from '../utils/transaction.js';
import { createTransfer, transferDetail, availableLots } from '../services/transfer.service.js';
import { listRecent } from '../services/document.service.js';

/** Crée un transfert : sortie du dépôt, entrée dans la pharmacie. */
export async function create(req, res) {
  const transfer = await write(transaction => createTransfer(req.body, req.user, transaction));
  res.status(201).json({
    id: transfer.id, reference: transfer.reference, fromLocation: transfer.fromLocation,
    toLocation: transfer.toLocation, reason: transfer.reason, costTotal: transfer.costTotal
  });
}

/** Historique des transferts (filtrable par magasin d'origine ou d'arrivée). */
export async function list(req, res) {
  const { location = null, limit = 100 } = req.query;
  const doc = await read(transaction => listRecent(Number(limit), transaction));
  const transfers = doc.filter(d => d.kind === 'TRANSFER')
    .filter(d => !location || d.fromLocation === location || d.toLocation === location);
  res.json(transfers);
}

export async function detail(req, res) {
  const result = await read(transaction => transferDetail(Number(req.params.id), transaction));
  res.json(result);
}

/** Lots disponibles dans un magasin, pour préparer le transfert (FEFO en tête). */
export async function lots(req, res) {
  const location = String(req.query.location || 'DEPOT').toUpperCase();
  const rows = await read(transaction => availableLots(transaction, location));
  res.json(rows);
}
