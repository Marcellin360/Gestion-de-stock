// Lots : consultation, blocage/déblocage (quarantaine, retrait, contrôle).
import { Lot, ReceiptLine, User } from '../models/index.js';
import { read, write } from '../utils/transaction.js';
import { setLotStatus } from '../services/inventory.service.js';

const MAGASINS = ['DEPOT', 'PHARMACY'];

export async function list(req, res) {
  const demande = String(req.query.location || '').toUpperCase();
  const roleCode = req.user.role?.code || req.user.roleCode;
  // Le dépôt ne travaille que sur les lots du dépôt, quoi qu'il demande ;
  // les autres rôles peuvent viser un magasin précis ou les deux (aucun filtre).
  const where = roleCode === 'DEPOT'
    ? { location: 'DEPOT' }
    : (MAGASINS.includes(demande) ? { location: demande } : {});
  const lots = await read(async transaction => {
    const rows = await Lot.findAll({ where, order: [['expiresOn', 'ASC NULLS LAST'], ['id', 'ASC']], transaction });
    return rows.map(row => row.toJSON());
  });
  res.json(lots);
}

export async function setStatus(req, res) {
  res.json(await write(transaction => setLotStatus(Number(req.params.id), req.body, req.user, transaction)));
}

/** Historique complet des mouvements d'un lot (§9.5). */
export async function movements(req, res) {
  const { Movement } = await import('../models/index.js');
  res.json(await read(async transaction => {
    const rows = await Movement.findAll({ where: { lotId: Number(req.params.id) }, order: [['id', 'DESC']], transaction });
    const users = await User.findAll({ transaction });
    return rows.map(movement => ({
      ...movement.toJSON(),
      userName: users.find(u => u.id === movement.userId)?.name || ''
    }));
  }));
}
