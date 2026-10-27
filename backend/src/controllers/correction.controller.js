// Corrections de réception (teboka ③, 2.7.34) : dépôt propose → admin tranche.
import { read, write } from '../utils/transaction.js';
import {
  listerCorrections, detailCorrection, proposerCorrection, deciderCorrection
} from '../services/correction.service.js';

export async function list(req, res) {
  const rows = await read(transaction => listerCorrections({ status: req.query.status || null }, transaction));
  res.json({ rows });
}

export async function detail(req, res) {
  const correction = await read(transaction => detailCorrection(Number(req.params.id), transaction));
  res.json(correction);
}

export async function proposer(req, res) {
  const correction = await write(transaction => proposerCorrection(Number(req.params.id), req.body, req.user, transaction));
  res.status(201).json(correction);
}

export async function valider(req, res) {
  const { correction, ajustements } = await write(transaction => deciderCorrection(
    Number(req.params.id), { decision: 'VALIDATE', note: req.body?.note }, req.user, transaction));
  res.json({ ...correction.toJSON(), ajustements: ajustements || [] });
}

export async function refuser(req, res) {
  const { correction } = await write(transaction => deciderCorrection(
    Number(req.params.id), { decision: 'REFUSE', note: req.body?.note }, req.user, transaction));
  res.json(correction);
}