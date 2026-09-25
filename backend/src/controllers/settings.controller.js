// Paramètres de l'officine (RG13, RG21, RG22) et catalogue des rôles.
import { read, write } from '../utils/transaction.js';
import { updateSettings, getSettings } from '../services/settings.service.js';

export async function get(req, res) {
  const settings = await read(transaction => getSettings(transaction));
  res.json(settings);
}

export async function put(req, res) {
  const updated = await write(transaction => updateSettings(req.body, req.user, transaction));
  res.json(updated);
}
