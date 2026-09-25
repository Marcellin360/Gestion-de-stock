// Données du poste de travail (une seule requête pour toute l'interface).
import { read } from '../utils/transaction.js';
import { buildData } from '../services/dashboard.service.js';

export async function getData(req, res) {
  const payload = await read(transaction => buildData(
    { ...describe(req.user), roleCode: req.user.role?.code },
    transaction
  ));
  res.json(payload);
}

const describe = user => ({ id: user.id, name: user.name, login: user.login });
