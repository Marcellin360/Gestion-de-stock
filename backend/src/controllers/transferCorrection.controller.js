// Corrections de transfert (2.7.79) : dépôt propose → admin tranche.
// (Même forme que correction.controller.js des réceptions, teboka ③ 2.7.34.)
import { read, write } from '../utils/transaction.js';
import {
  listerCorrectionsTransfert, detailCorrectionTransfert,
  proposerCorrectionTransfert, deciderCorrectionTransfert
} from '../services/transferCorrection.service.js';

export async function list(req, res) {
  const rows = await read(transaction => listerCorrectionsTransfert({ status: req.query.status || null }, transaction));
  res.json({ rows });
}

export async function detail(req, res) {
  const correction = await read(transaction => detailCorrectionTransfert(Number(req.params.id), transaction));
  res.json(correction);
}

export async function proposer(req, res) {
  const correction = await write(transaction => proposerCorrectionTransfert(Number(req.params.id), req.body, req.user, transaction));
  res.status(201).json(correction);
}

export async function valider(req, res) {
  const { correction } = await write(transaction => deciderCorrectionTransfert(
    Number(req.params.id), { decision: 'VALIDATE', note: req.body?.note }, req.user, transaction));
  res.json(correction);
}

export async function refuser(req, res) {
  const { correction } = await write(transaction => deciderCorrectionTransfert(
    Number(req.params.id), { decision: 'REFUSE', note: req.body?.note }, req.user, transaction));
  res.json(correction);
}