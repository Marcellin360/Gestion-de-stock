// Pertes, casse, expiration, don (§9.11, RG06, RG07).
import { write } from '../utils/transaction.js';
import { createLoss } from '../services/loss.service.js';

export async function create(req, res) {
  const loss = await write(transaction => createLoss(req.body, req.user, transaction));
  res.status(201).json(loss);
}
