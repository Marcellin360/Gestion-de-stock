// 2.7.35 + 2.7.36 + 2.7.38 — hôpital : exposé REST des référentiels carnet
// (patients, personnel — garde par dates sur la fiche) et lectures de SÉJOUR.
import { read, write } from '../utils/transaction.js';
import {
  listerPatients, creerPatient, patchPatient,
  listerStaff, creerStaff, patchStaff, activiteStaff,
  sejours, sejourDetail
} from '../services/hospital.service.js';
import { ordonnanceSejourHtml, ordonnanceSejourPdfDoc } from '../services/ticket.service.js';

export async function patientsList(req, res) {
  res.json(await read(transaction => listerPatients(transaction)));
}

export async function patientCreate(req, res) {
  const created = await write(transaction => creerPatient(req.body, req.user, transaction));
  res.status(201).json(created);
}

export async function patientPatch(req, res) {
  const patched = await write(transaction => patchPatient(Number(req.params.id), req.body, transaction));
  res.json(patched);
}

export async function staffList(req, res) {
  res.json(await read(transaction => listerStaff(transaction)));
}

export async function staffCreate(req, res) {
  const created = await write(transaction => creerStaff(req.body, transaction));
  res.status(201).json(created);
}

export async function staffPatch(req, res) {
  const patched = await write(transaction => patchStaff(Number(req.params.id), req.body, transaction));
  res.json(patched);
}

export async function staffActivity(req, res) {
  res.json(await read(transaction => activiteStaff(Number(req.params.id), transaction)));
}

// 2.7.36 — SÉJOURS : liste par patient + détail complet (historique de vente,
// onglet « Clients hôpital ») + l'ordre des délivrances.
export async function sejoursList(req, res) {
  res.json(await read(transaction => sejours(transaction)));
}

/** Lit la fenêtre « from/to » facultative de la requête (AAA-MM-JJ). */
function periodeQuery(req) {
  const jour = valeur => (typeof valeur === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valeur) ? valeur : null);
  return { du: jour(req.query.du), au: jour(req.query.au) };
}

export async function sejourShow(req, res) {
  res.json(await read(transaction => sejourDetail(Number(req.params.id), periodeQuery(req), transaction)));
}

export async function sejourOrdonnance(req, res) {
  // 2.7.37 — teboka ⑤ : l'ordonnance de séjour accepte « du » & « date » —
  // on n'imprime que la fenêtre hospitalière voulue.
  // 2.7.56 — `?fmt=pdf` : même document téléchargé en PDF.
  if (req.query.fmt === 'pdf') {
    const { buffer, filename } = await read(transaction => ordonnanceSejourPdfDoc(Number(req.params.id), periodeQuery(req), transaction));
    return res
      .set('Content-Type', 'application/pdf')
      .set('Content-Disposition', `attachment; filename="${filename}"`)
      .send(buffer);
  }
  const html = await read(transaction => ordonnanceSejourHtml(Number(req.params.id), periodeQuery(req), transaction));
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
}