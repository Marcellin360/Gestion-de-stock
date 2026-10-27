// ============================================================================
// Documents imprimables (bons, tickets, feuilles, rapports) : l'impression et
// l'enregistrement en PDF passent par le navigateur, sans dépendance lourde.
// ============================================================================
import { Receipt, ReceiptLine, Transfer, TransferLine, Sale, SaleLine, Loss, LossLine, Inventory, InventoryLine, Product, Lot, User, Supplier, Adjustment, Patient, MedicalStaff } from '../models/index.js';
import { ensure } from '../utils/errors.js';
import { getSettings } from './settings.service.js';
import { receiptNote } from '../templates/receiptNote.js';
import { saleTicket } from '../templates/saleTicket.js';
import { ordonnanceTicket } from '../templates/ordonnanceTicket.js';
import { ordonnanceSejourTicket } from '../templates/ordonnanceSejour.js';
import { ticketVentePdf, ordonnancePdf, ordonnanceSejourPdf } from '../templates/documentsPdf.js';
// 2.7.71 — fiche de stock du menu « Stock » téléchargée en PDF (« Imprimer »).
import { etatStockPdf } from '../templates/etatStockPdf.js';
// 2.7.72 — bordereau de transfert (« Historique de transfert », « Détail »).
import { transfertPdf } from '../templates/transfertPdf.js';
// 2.7.73 — fiche de perte / don (« Pertes et dons », « Détail »).
import { pertesPdf } from '../templates/pertesPdf.js';
// 2.7.78 — bon de réception (« Réceptions », boîte « Détail », « Télécharger »).
import { receptionPdf } from '../templates/receptionPdf.js';
import { lossSheet } from '../templates/lossSheet.js';
import { transferNote } from '../templates/transferNote.js';
import { inventorySheet } from '../templates/inventorySheet.js';
import { reportTable } from '../templates/reportTable.js';
import { buildReport, reportSummary, REPORT_LABELS } from './report.service.js';

async function context(ids, transaction) {
  const [pharmacy, products, lots, user, supplier] = await Promise.all([
    getSettings(transaction).then(s => s.toJSON()),
    Product.findAll({ transaction }),
    Lot.findAll({ transaction }),
    ids.userId ? User.findByPk(ids.userId, { transaction }) : null,
    ids.supplierId ? Supplier.findByPk(ids.supplierId, { transaction }) : null
  ]);
  return { pharmacy, products, lots, user, supplier };
}

export async function documentHtml(kind, id, transaction) {
  const map = {
    RECEIPT: async () => {
      const receipt = await Receipt.findByPk(id, { transaction });
      ensure(receipt, 'Réception introuvable.', 404);
      const lines = await ReceiptLine.findAll({ where: { receiptId: id }, order: [['id', 'ASC']], transaction });
      return receiptNote({
        receipt: receipt.toJSON(), lines: lines.map(l => l.toJSON()),
        ...(await context({ userId: receipt.userId, supplierId: receipt.supplierId }, transaction))
      });
    },
    SALE: async () => {
      const sale = await Sale.findByPk(id, { transaction });
      ensure(sale, 'Vente introuvable.', 404);
      const lines = await SaleLine.findAll({ where: { saleId: id }, order: [['id', 'ASC']], transaction });
      return saleTicket({
        sale: sale.toJSON(), lines: lines.map(l => l.toJSON()),
        ...(await context({ userId: sale.userId }, transaction))
      });
    },
    LOSS: async () => {
      const loss = await Loss.findByPk(id, { transaction });
      ensure(loss, 'Perte introuvable.', 404);
      const lines = await LossLine.findAll({ where: { lossId: id }, order: [['id', 'ASC']], transaction });
      return lossSheet({
        loss: loss.toJSON(), lines: lines.map(l => l.toJSON()),
        ...(await context({ userId: loss.userId }, transaction))
      });
    },
    // Bordereau de transfert dépôt → pharmacie : c'est le papier qui accompagne
    // physiquement les cartons de la réserve vers le comptoir.
    TRANSFER: async () => {
      const transfer = await Transfer.findByPk(id, { transaction });
      ensure(transfer, 'Transfert introuvable.', 404);
      const lines = await TransferLine.findAll({ where: { transferId: id }, order: [['id', 'ASC']], transaction });
      const lots = await Lot.findAll({ transaction });
      return transferNote({
        transfer: transfer.toJSON(),
        lines: lines.map(l => ({
          ...l.toJSON(),
          lotNumber: lots.find(x => x.id === l.fromLotId)?.number || '—',
          expiresOn: lots.find(x => x.id === l.fromLotId)?.expiresOn || null
        })),
        ...(await context({ userId: transfer.userId }, transaction))
      });
    },
    ADJUSTMENT: async () => {
      const adjustment = await Adjustment.findByPk(id, { transaction });
      ensure(adjustment, 'Ajustement introuvable.', 404);
      const inventory = adjustment.inventoryId ? await Inventory.findByPk(adjustment.inventoryId, { transaction }) : null;
      const lines = inventory ? await InventoryLine.findAll({ where: { inventoryId: inventory.id }, order: [['id', 'ASC']], transaction }) : [];
      return inventorySheet({
        inventory: (inventory || { reference: adjustment.reference, createdAt: adjustment.createdAt, scope: '', toJSON() { return this; } }),
        lines: lines.map(l => l.toJSON()),
        ...(await context({ userId: adjustment.userId }, transaction))
      });
    }
  };
  const render = map[kind];
  ensure(render, 'Type de document inconnu.', 404);
  return render();
}

/**
 * 2.7.35 — Ordonnance d'une vente sur carnet : même vente que le ticket,
 * mais le papier porte patient + prescripteur + médicaments SANS montants.
 */
export async function ordonnanceHtml(id, transaction) {
  const sale = await Sale.findByPk(id, { transaction });
  ensure(sale, 'Vente introuvable.', 404);
  ensure(sale.patientId || sale.medicalStaffId,
    'Cette vente n’est pas rattachée à un carnet : imprimez plutôt son ticket de vente.', 422);
  const lines = await SaleLine.findAll({ where: { saleId: id }, order: [['id', 'ASC']], transaction });
  const [patient, prescriber] = await Promise.all([
    sale.patientId ? Patient.findByPk(sale.patientId, { transaction }) : null,
    sale.medicalStaffId ? MedicalStaff.findByPk(sale.medicalStaffId, { transaction }) : null
  ]);
  return ordonnanceTicket({
    sale: sale.toJSON(), lines: lines.map(l => l.toJSON()),
    patient: patient ? patient.toJSON() : null,
    prescriber: prescriber ? prescriber.toJSON() : null,
    ...(await context({ userId: sale.userId }, transaction))
  });
}

/**
 * 2.7.36 + 2.7.37 — ORDONNANCE DE SÉJOUR (une seule par hospitalisation) :
 * le document reprend le séjour du patient — médicaments cumulés par
 * produit —, désormais AVEC leurs quantités, prix unitaires, montants et
 * total. Il accepte une fenêtre « du … au … » (2.7.37).
 * Ré-imprimée chaque jour, elle remplace la feuille de la veille.
 */
export async function ordonnanceSejourHtml(patientId, periode, transaction) {
  const patient = await Patient.findByPk(patientId, { transaction });
  ensure(patient, 'Patient introuvable.', 404);
  const { sejourDetail } = await import('./hospital.service.js');
  const sejour = await sejourDetail(patientId, periode, transaction);
  ensure(sejour.ventes.length > 0,
    'Ce patient n’a pris aucun médicament à la pharmacie sur cette période : aucune ordonnance à imprimer.', 422);
  return ordonnanceSejourTicket({
    patient: patient.toJSON(),
    sejour,
    periode: periode || {},
    ...(await context({}, transaction))
  });
}

export async function inventoryHtml(id, transaction) {
  const inventory = await Inventory.findByPk(id, { transaction });
  ensure(inventory, 'Inventaire introuvable.', 404);
  const lines = await InventoryLine.findAll({ where: { inventoryId: id }, order: [['id', 'ASC']], transaction });
  return inventorySheet({
    inventory: inventory.toJSON(), lines: lines.map(l => l.toJSON()),
    ...(await context({ userId: inventory.userId }, transaction))
  });
}

export async function reportHtml({ type, from, to, supplierId, productId = null, location = null }, user, transaction) {
  const report = await buildReport({ type, from, to, supplierId, productId, location, page: 1, limit: 5000 }, transaction);
  const summary = await reportSummary({ from, to }, transaction);
  let title = REPORT_LABELS[type] || 'Rapport';
  let subtitle = `Du ${from} au ${to}`;
  // 2.7.33 — teboka ⑪ : la fiche d'un médicament porte son nom en titre, son
  // code, son magasin et sa période en sous-titre (le registre imprimé).
  if (type === 'fiche_produit' && productId) {
    const produit = await Product.findByPk(productId, { transaction });
    if (produit) {
      title = `Fiche de stock — ${produit.name}`;
      subtitle = `${produit.code} · ${location === 'DEPOT' ? 'Dépôt (réserve)' : 'Pharmacie (comptoir)'} · du ${from} au ${to}`;
    }
  }
  return reportTable({
    title,
    subtitle,
    pharmacy: (await getSettings(transaction)).toJSON(),
    rows: report.rows,
    summary: Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, String(v)])),
    user
  });
}

// ---------------------------------------------------------------------------
// 2.7.71 — FICHE DE STOCK EN PDF TÉLÉCHARGEABLE (menu « Stock », « Imprimer »).
// ---------------------------------------------------------------------------

/** Fiche de stock (pharmacie ou dépôt) EN PDF — `?fmt=pdf` sur /reports/print.
 *  Même tableau que l'impression HTML (du … au …, toutes colonnes sauf seuil /
 *  situation), dessiné en A4 paysage par templates/etatStockPdf.js. */
export async function etatStockPdfDoc({ type, from, to, supplierId = null, productId = null, location = null }, user, transaction) {
  const report = await buildReport({ type, from, to, supplierId, productId, location, page: 1, limit: 20000 }, transaction);
  const magasin = location === 'DEPOT' || type === 'fiche_depot' ? 'Dépôt (réserve)' : 'Pharmacie (comptoir)';
  const buffer = etatStockPdf({
    titre: `Fiche de stock — ${magasin}`,
    sousTitre: `Du ${from} au ${to}`,
    pharmacy: (await getSettings(transaction)).toJSON(),
    lignes: report.rows
  });
  return { buffer, filename: `fiche-stock-${type}-${from}-${to}.pdf` };
}

// ---------------------------------------------------------------------------
// 2.7.72 — BORDEREAU DE TRANSFERT EN PDF TÉLÉCHARGEABLE.
//   Menu « Historique de transfert », boîte « Détail » : « Télécharger » et
//   « Imprimer » enregistrent/dessinent le PDF (templates/transfertPdf.js,
//   A4 portrait, signatures dépôt/pharmacie) au lieu d'un fichier .html.
// ---------------------------------------------------------------------------

/** Bordereau de transfert dépôt → pharmacie EN PDF (`?fmt=pdf` sur
 *  /documents/TRANSFER/:id/print). Mêmes lignes que le HTML (numéros de lot
 *  résolus depuis les lots), dessiné en A4 portrait avec les signatures. */
export async function transfertBordereauPdf(id, transaction) {
  const transfer = await Transfer.findByPk(id, { transaction });
  ensure(transfer, 'Transfert introuvable.', 404);
  const lines = await TransferLine.findAll({ where: { transferId: id }, order: [['id', 'ASC']], transaction });
  const lots = await Lot.findAll({ transaction });
  const buffer = transfertPdf({
    transfer: transfer.toJSON(),
    lines: lines.map(l => ({
      ...l.toJSON(),
      lotNumber: lots.find(x => x.id === l.fromLotId)?.number || '—',
      expiresOn: lots.find(x => x.id === l.fromLotId)?.expiresOn || null
    })),
    ...(await context({ userId: transfer.userId }, transaction))
  });
  return { buffer, filename: `transfert-${transfer.reference || id}.pdf` };
}

// ---------------------------------------------------------------------------
// 2.7.73 — FICHE DE PERTE / DON EN PDF TÉLÉCHARGEABLE.
//   Menu « Pertes et dons », boîte « Détail » : « Télécharger » et
//   « Imprimer » enregistrent le PDF (templates/pertesPdf.js, A4 portrait,
//   remarque justificative et signatures) au lieu d'une page HTML.
// ---------------------------------------------------------------------------

/** Fiche de perte / don EN PDF (`?fmt=pdf` sur /documents/LOSS/:id/print). */
export async function perteFichePdf(id, transaction) {
  const loss = await Loss.findByPk(id, { transaction });
  ensure(loss, 'Perte introuvable.', 404);
  const lines = await LossLine.findAll({ where: { lossId: id }, order: [['id', 'ASC']], transaction });
  const lots = await Lot.findAll({ transaction });
  const buffer = pertesPdf({
    loss: loss.toJSON(),
    lines: lines.map(l => ({
      ...l.toJSON(),
      lotNumber: lots.find(x => x.id === l.lotId)?.number || '—',
      expiresOn: lots.find(x => x.id === l.lotId)?.expiresOn || null
    })),
    ...(await context({ userId: loss.userId }, transaction))
  });
  return { buffer, filename: `perte-${loss.reference || id}.pdf` };
}

// ---------------------------------------------------------------------------
// 2.7.78 — BON DE RÉCEPTION EN PDF TÉLÉCHARGEABLE.
//   Menu « Réceptions », boîte « Détail » (sans bouton « Imprimer » depuis
//   cette version) : « Télécharger » donne le PDF (templates/receptionPdf.js,
//   A4 portrait, fournisseur, lignes avec fabriquant, total) au lieu d'une
//   page HTML à imprimer à la main.
// ---------------------------------------------------------------------------

/** Bon de réception EN PDF (`?fmt=pdf` sur /documents/RECEIPT/:id/print).
 *  Les lignes portent déjà numéro de lot, fabriquant et expiration (saisis à
 *  la réception, 2.7.49) — pas besoin de repasser par les lots ; seul le NOM
 *  du médicament vient de la fiche produit. */
export async function receptionBonPdf(id, transaction) {
  const receipt = await Receipt.findByPk(id, { transaction });
  ensure(receipt, 'Réception introuvable.', 404);
  const lignes = await ReceiptLine.findAll({
    where: { receiptId: id }, order: [['id', 'ASC']],
    include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }],
    transaction
  });
  const buffer = receptionPdf({
    receipt: receipt.toJSON(),
    lines: lignes.map(l => {
      const ligne = l.toJSON();
      return {
        ...ligne,
        product: ligne.product?.name || '—',
        // Fabriquant et expiration : saisis lot par lot à la réception
        // (colonnes du bon, 2.7.49).
        manufacturer: ligne.manufacturer || '',
        expiresOn: ligne.expiresOn || null
      };
    }),
    ...(await context({ userId: receipt.userId, supplierId: receipt.supplierId }, transaction))
  });
  return { buffer, filename: `reception-${receipt.reference || id}.pdf` };
}

// ---------------------------------------------------------------------------
// 2.7.56 — VERSIONS PDF TÉLÉCHARGEABLES (bouton « Télécharger le PDF »).
//   Mêmes données que le HTML d'impression, rendues par documentsPdf.js via
//   l'utilitaire sans dépendance utils/pdf.js ; `?fmt=pdf` sur les routes.
// ---------------------------------------------------------------------------

/** Ticket de vente : UNE page A5 paysage, Exemplaire client à gauche et
 *  Copie pharmacie à droite, coupée verticalement au milieu (2.7.59). */
export async function venteTicketPdf(id, transaction) {
  const sale = await Sale.findByPk(id, { transaction });
  ensure(sale, 'Vente introuvable.', 404);
  const lines = await SaleLine.findAll({ where: { saleId: id }, order: [['id', 'ASC']], transaction });
  const buffer = ticketVentePdf({
    sale: sale.toJSON(), lines: lines.map(l => l.toJSON()),
    ...(await context({ userId: sale.userId }, transaction))
  });
  return { buffer, filename: `ticket-${sale.reference || id}.pdf` };
}

/** Ordonnance d'une vente sur carnet : SANS montants, avec signatures. */
export async function ordonnanceTicketPdf(id, transaction) {
  const sale = await Sale.findByPk(id, { transaction });
  ensure(sale, 'Vente introuvable.', 404);
  ensure(sale.patientId || sale.medicalStaffId,
    'Cette vente n’est pas rattachée à un carnet : imprimez plutôt son ticket de vente.', 422);
  const lines = await SaleLine.findAll({ where: { saleId: id }, order: [['id', 'ASC']], transaction });
  const [patient, prescriber] = await Promise.all([
    sale.patientId ? Patient.findByPk(sale.patientId, { transaction }) : null,
    sale.medicalStaffId ? MedicalStaff.findByPk(sale.medicalStaffId, { transaction }) : null
  ]);
  const buffer = ordonnancePdf({
    sale: sale.toJSON(), lines: lines.map(l => l.toJSON()),
    patient: patient ? patient.toJSON() : null,
    prescriber: prescriber ? prescriber.toJSON() : null,
    ...(await context({ userId: sale.userId }, transaction))
  });
  return { buffer, filename: `ordonnance-${sale.reference || id}.pdf` };
}

/** Ordonnance de séjour (cumul de l'hospitalisation) : quantités, prix, total. */
export async function ordonnanceSejourPdfDoc(patientId, periode, transaction) {
  const patient = await Patient.findByPk(patientId, { transaction });
  ensure(patient, 'Patient introuvable.', 404);
  const { sejourDetail } = await import('./hospital.service.js');
  const sejour = await sejourDetail(patientId, periode, transaction);
  ensure(sejour.ventes.length > 0,
    'Ce patient n’a pris aucun médicament à la pharmacie sur cette période : aucune ordonnance à imprimer.', 422);
  const buffer = ordonnanceSejourPdf({
    patient: patient.toJSON(),
    sejour,
    periode: periode || {},
    ...(await context({}, transaction))
  });
  return { buffer, filename: `ordonnance-sejour-${patient.id}.pdf` };
}