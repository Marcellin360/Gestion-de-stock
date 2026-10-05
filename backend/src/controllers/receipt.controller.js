// Réceptions fournisseur (§9.4).
import { write } from '../utils/transaction.js';
import { createReceipt } from '../services/receipt.service.js';

export async function create(req, res) {
  const receipt = await write(transaction => createReceipt(req.body, req.user, transaction));
  // « ajustements » : numéros de lot réutilisés à un autre prix (lot distinct créé
  // automatiquement). Propriété calculée, jamais enregistrée en base.
  res.status(201).json({ ...receipt.toJSON(), ajustements: receipt.ajustements || [] });
}