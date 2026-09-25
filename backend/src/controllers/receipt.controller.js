// Réceptions fournisseur (§9.4).
import { write } from '../utils/transaction.js';
import { createReceipt } from '../services/receipt.service.js';

export async function create(req, res) {
  const receipt = await write(transaction => createReceipt(req.body, req.user, transaction));
  res.status(201).json(receipt);
}
