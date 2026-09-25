// Documents porteurs de mouvements : consultation, annulation tracée (RG19), impression.
import { read, write } from '../utils/transaction.js';
import { cancelDocument, documentDetail, listRecent, documentRegistry } from '../services/document.service.js';
import { documentHtml } from '../services/ticket.service.js';
import { ensure } from '../utils/errors.js';

export async function list(req, res) {
  const limit = Math.min(Number(req.query.limit || 300), 1000);
  res.json(await read(transaction => listRecent(limit, transaction)));
}

export async function detail(req, res) {
  const kind = String(req.params.kind).toUpperCase();
  documentRegistry(kind);
  const roleCode = req.user.role?.code || req.user.roleCode;
  // Le dépôt ne voit que les documents des deux magasins qui le concernent :
  // réception (entrée au dépôt), transfert (sa sortie), perte et ajustement.
  if (roleCode === 'DEPOT') {
    ensure(['RECEIPT', 'TRANSFER', 'LOSS', 'ADJUSTMENT'].includes(kind), 'Document réservé à la pharmacie.', 403);
  }
  const document = await read(transaction => documentDetail(kind, Number(req.params.id), transaction));
  if (roleCode === 'DEPOT') {
    // Le dépôt connaît les coûts d'achat mais jamais les prix de vente ni les marges.
    delete document.total;
    delete document.margin;
  }
  res.json(document);
}

export async function cancel(req, res) {
  const kind = String(req.params.kind).toUpperCase();
  documentRegistry(kind);
  const document = await write(transaction => cancelDocument(kind, Number(req.params.id), req.body.reason, req.user, transaction));
  res.json({ id: document.id, reference: document.reference, status: document.status });
}

export async function printable(req, res) {
  const kind = String(req.params.kind).toUpperCase();
  documentRegistry(kind);
  const html = await read(transaction => documentHtml(kind, Number(req.params.id), transaction));
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
}
