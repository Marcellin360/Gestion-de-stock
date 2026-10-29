// ============================================================================
// Ventes (§9.10, RG05, RG08) : proposition des lots en FEFO, calcul du prix côté
// serveur, décrément du stock uniquement après validation, marge brute conservée.
//
// 2.7.12 — VENTE AU DÉTAIL en 3 unités par ligne :
//   BOX     → boîte entière (unité de gestion du stock) ;
//   BLISTER → plaquette (« boîte 1 = plaquettes N », N réglé dans la fiche) ;
//   UNIT    → comprimé (« plaquette 1 = comprimé M »).
// « quantity » dans la requête = le nombre tapé DANS L'UNITÉ CHOISIE (entier,
// ex. 3 plaquettes). Le serveur convertit en équivalent-boîte pour le stock
// (3 plaquettes = 0,3 boîte si la boîte fait 10 plaquettes) : les mouvements,
// la valorisation et les marges restent exacts, comme avant.
//
// Les 3 prix sont INDÉPENDANTS (« tsy hitovy ny vidiny ») : le prix d'une
// plaquette ou d'un comprimé se règle par médicament ; à 0, il est calculé
// automatiquement AU PRORATA du prix de la boîte au moment de la vente.
//
// 2.7.84 — CHAÎNE DE CONDITIONNEMENT GÉNÉRALISÉE : quand la fiche porte un
// « packaging » (saisi à la réception : carton → boîte → plaquette →
// comprimé, flacon → ml, rouleau → cm…), TOUTE unité de la chaîne située
// sous l'unité de gestion est vendable (« ml », « comprimé », « cm »…). Les
// codes historiques BOX / BLISTER / UNIT restent acceptés (traduits vers
// l'unité de gestion, « plaquette », « comprimé ») — utils/conditionnement.js.
// ============================================================================
import { Sale, SaleLine, Product, Patient, MedicalStaff } from '../models/index.js';
import { D, money } from '../utils/money.js';
import { ensure } from '../utils/errors.js';
import { today } from '../utils/dates.js';
import { reference as makeReference } from '../utils/ids.js';
import { STATUS, LOT_PICKING } from '../config/constants.js';
import { lockProductLots, pickLots, applyMovements, quantite } from './stock.service.js';
import { salePrice, retainedCost } from './pricing.service.js';
import { getSettings } from './settings.service.js';
import { log } from './audit.service.js';
// 2.7.79 — « Servi par » saisi à la caisse : le nom est cousu en tête de la
// note de la vente (marqueur reconnaissable), sans colonne nouvelle.
import { coudreServiPar } from '../utils/serviPar.js';
// 2.7.84 — chaîne de conditionnement : facteurs, traductions et libellés.
import {
  chaineEffective, facteurVers, saleUnitCanonique, libelleUnite
} from '../utils/conditionnement.js';

/** Nombre de sous-unités contenues dans 1 unité de gestion (boîte, flacon…). */
export function saleUnitFactor(product, saleUnit) {
  // 2.7.84 — chaîne mémorisée : le facteur se calcule dans la chaîne.
  const chaine = chaineEffective(product);
  if (chaine.length && product.packaging) {
    const unite = saleUnitCanonique(product, saleUnit);
    const gestion = String(product.unit || 'boîte').toLowerCase();
    if (unite === gestion) return 1;
    return facteurVers(chaine, gestion, unite) ?? 0;
  }
  // Comportement 2.7.12 inchangé pour les fiches sans chaîne.
  if (saleUnit === 'BLISTER') return Number(product.blistersPerBox) || 0;
  if (saleUnit === 'UNIT') return (Number(product.blistersPerBox) || 0) * (Number(product.unitsPerBlister) || 0);
  return 1;
}

/** Libellé d'unité pour les messages d'erreur et les documents. */
export const SALE_UNIT_LABELS = { BOX: 'boîte', BLISTER: 'plaquette', UNIT: 'comprimé' };

/**
 * Prix PAR UNITÉ de vente demandée (RG21 : 3 prix indépendants).
 * Prix détaillé non renseigné (= 0) sur la fiche → calcul au prorata du prix
 * de la boîte appliqué au comptoir (jamais de prix différent de l'étiquette).
 * 2.7.84 — les prix indépendants restent ceux de « plaquette » et « comprimé »
 * (fiche « Modifier ») ; toute autre unité de la chaîne est tarifée AU PRORATA
 * du prix de l'unité de gestion (« ml », « cm », « carton »…).
 */
export function priceForUnit(product, saleUnit, boxPrice) {
  // 2.7.84 — chaîne généralisée (le nom canonique est déjà résolu).
  if (chaineEffective(product).length && product.packaging) {
    if (saleUnit === 'plaquette' && D(product.pricePerBlister).gt(0)) return money(product.pricePerBlister);
    if (saleUnit === 'comprimé' && D(product.pricePerUnit).gt(0)) return money(product.pricePerUnit);
    const gestion = String(product.unit || 'boîte').toLowerCase();
    if (saleUnit === gestion) return boxPrice;
    const facteur = facteurVers(chaineEffective(product), gestion, saleUnit);
    return facteur ? money(D(boxPrice).div(facteur)) : boxPrice;
  }
  // 2.7.12 — fiches sans chaîne : inchangé.
  if (saleUnit === 'BLISTER') {
    return D(product.pricePerBlister).gt(0)
      ? money(product.pricePerBlister)
      : money(D(boxPrice).div(saleUnitFactor(product, 'BLISTER')));
  }
  if (saleUnit === 'UNIT') {
    return D(product.pricePerUnit).gt(0)
      ? money(product.pricePerUnit)
      : money(D(boxPrice).div(saleUnitFactor(product, 'UNIT')));
  }
  return boxPrice;
}

/** Vérifie que l'unité demandée est vendable pour ce médicament. */
function assertUnitAllowed(product, saleUnit) {
  if (saleUnit === 'BOX') return;
  // 2.7.84 — chaîne : l'unité doit exister dans la chaîne (sous la gestion).
  if (chaineEffective(product).length && product.packaging) {
    const gestion = String(product.unit || 'boîte').toLowerCase();
    if (saleUnit === gestion) return;
    const facteur = facteurVers(chaineEffective(product), gestion, saleUnit);
    ensure(facteur && facteur > 1,
      `« ${product.name} » ne se vend pas par ${libelleUnite(saleUnit)} : `
      + 'son conditionnement n’en comporte pas. Réglez la chaîne à la réception '
      + '(« 1 boîte = N plaquettes… ») pour l’activer.');
    return;
  }
  const facteur = saleUnitFactor(product, saleUnit);
  ensure(facteur > 1,
    `« ${product.name} » ne se vend pas par ${SALE_UNIT_LABELS[saleUnit] ?? saleUnit} : `
    + 'son conditionnement n’en comporte pas. Renseignez le nombre de plaquettes / comprimé '
    + 'dans la fiche du médicament (Catalogue → Modifier) pour l’activer.');
}

/**
 * Proposition de vente (aucun impact sur le stock) : lots FEFO, quantités et prix.
 * Sert d'écran de vérification avant validation et limite les erreurs de caisse.
 */
export async function quoteSale(payload, transaction) {
  const settings = await getSettings(transaction);
  const lignesPrecedentes = [];
  let total = D(0);
  for (const row of payload.lines) {
    const product = await Product.findByPk(row.productId, { transaction });
    ensure(product && product.active, 'Médicament absent ou inactif.');
    // 2.7.84 — le code caisse (BOX/BLISTER/UNIT) est traduit vers l'unité de
    // la chaîne (« boîte » → unité de gestion du produit, quel qu'en soit le
    // nom) ; les unités brutes (« ml », « comprimé »…) passent telles quelles.
    const saleUnit = saleUnitCanonique(product, row.saleUnit || 'BOX');
    assertUnitAllowed(product, saleUnit);
    const facteur = saleUnitFactor(product, saleUnit);
    // Équivalent en unité de gestion (boîte) retiré du stock : 6 décimales.
    const quantiteGestion = quantite(D(row.quantity).div(facteur).toFixed(6));
    // La vente se fait toujours au comptoir : seuls les lots de la PHARMACIE sont proposés.
    const lots = await lockProductLots(product.id, transaction, 'PHARMACY');
    // Unités réellement vendables au comptoir : ce nombre est annoncé au caissier
    // quand la quantité demandée dépasse le disponible (message actionnable).
    const vendables = lots.filter(lot => lot.status === STATUS.AVAILABLE && Number(lot.quantity) > 0
      && (settings.allowExpiredSale || (Boolean(lot.expiresOn) && lot.expiresOn >= today())));
    const disponiblesGestion = vendables.reduce((total, lot) => total + Number(lot.quantity), 0);
    const disponiblesUnites = quantite(Math.floor(D(disponiblesGestion).mul(facteur).toNumber() * 1e6) / 1e6);
    const picked = pickLots(lots, quantiteGestion, {
      date: today(), method: LOT_PICKING.FEFO, allowExpired: settings.allowExpiredSale
    });
    const etiquette = libelleUnite(saleUnit);   // 2.7.84 — legacy + unités brutes
    ensure(picked.missing === 0,
      `Stock vendable insuffisant au comptoir pour « ${product.name} » : ${disponiblesUnites} ${etiquette}(s) vendable(s), `
      + `${row.quantity} demandée(s). Les lots expirés, bloqués ou sans date d’expiration ne sont jamais proposés ; `
      + 'la marchandise restée au dépôt se transfère d’abord depuis l’écran « Transferts ».');
    for (const { lot, quantity: priseGestion } of picked.picked) {
      // Coût réel de sortie : le lot vendu (valorisation LOT) ou le CMP du médicament.
      const coutGestion = retainedCost(product, lot, settings.valuation);
      // PRIX APPLIQUÉ AU COMPTOIR = celui affiché dans le catalogue (calculé sur le
      // CMP par défaut, voir services/pricing.service.js). Le recalculer lot par lot
      // ferait vendre le même médicament à deux prix différents dans la journée,
      // selon le lot que FEFO a sorti — et à un prix différent de l'étiquette.
      // Repli sur le calcul par coût si la fiche n'a pas encore de prix (> 0).
      const prixBoite = D(product.sellingPrice).gt(0)
        ? money(product.sellingPrice)
        : salePrice(coutGestion, product.marginRate, settings.marginMode, settings.minMargin, settings.maxMargin);
      // Prix par unité vendue (plaquette / comprimé / boîte), 3 prix indépendants.
      const prixUnite = priceForUnit(product, saleUnit, prixBoite);
      // Coût retenu par unité vendue = coût d'une boîte ÷ facteur (6 décimales).
      const coutUnite = money(D(coutGestion).div(facteur));
      // Part de cette prise de lot exprimée dans l'unité vendue (peut être
      // fractionnée si FEFO coupe une ligne entre deux lots).
      const priseUnites = quantite(D(priseGestion).mul(facteur).toFixed(6));
      lignesPrecedentes.push({
        productId: product.id, product: product.name, code: product.code, unit: product.unit,
        lotId: lot.id, lot: lot.number, expiresOn: lot.expiresOn,
        saleUnit, unitFactor: facteur,
        quantity: priseGestion,                       // équivalent-boîte (stock)
        saleQuantity: priseUnites,                    // nombre dans l'unité vendue
        unitPrice: prixUnite,                         // par unité vendue
        unitCost: coutUnite,                          // par unité vendue
        gestionCost: money(coutGestion),              // par boîte (mouvements)
        marginRate: product.marginRate,
        margin: money(D(prixUnite).sub(coutUnite).mul(priseUnites))
      });
      total = total.add(D(prixUnite).mul(priseUnites));
    }
  }
  const costTotal = lignesPrecedentes.reduce((acc, line) => acc.add(D(line.unitCost).mul(line.saleQuantity)), D(0));
  return {
    lines: lignesPrecedentes,
    total: money(total),
    costTotal: money(costTotal),
    margin: money(total.sub(costTotal)),
    valuation: settings.valuation,
    marginMode: settings.marginMode
  };
}

/**
 * Valide une vente : reprend la logique FEFO, écrit la vente, ses lignes et les
 * mouvements de sortie. La répartition par lot est recalculée ici : le navigateur
 * ne décide jamais des lots sortis ni des prix appliqués.
 */
export async function createSale(payload, user, transaction) {
  const existing = await Sale.findOne({ where: { requestKey: payload.requestKey }, transaction });
  if (existing) {
    ensure(existing.userId === user.id, 'Clé de requête déjà utilisée par un autre utilisateur.', 409);
    // Rejeu réseau : on renvoie la vente déjà enregistrée, sans nouveau mouvement de stock.
    return { sale: existing, lines: [] };
  }
  const prepared = await quoteSale({ ...payload }, transaction);
  ensure(payload.expectedTotal === undefined || D(payload.expectedTotal).eq(prepared.total),
    'Le prix ou la disponibilité a changé depuis la vérification. Refaire la vérification avant de valider.', 409);

  // 2.7.35 — hôpital : le carnet (patient + prescripteur) reste FACTUTATIF ;
  // s'il est renseigné, patient et employé doivent exister et être actifs.
  let patient = null;
  if (payload.patientId) {
    patient = await Patient.findByPk(payload.patientId, { transaction });
    ensure(patient && patient.active, 'Patient introuvable ou clôturé.', 422);
  }
  let staff = null;
  if (payload.medicalStaffId) {
    staff = await MedicalStaff.findByPk(payload.medicalStaffId, { transaction });
    ensure(staff && staff.active, 'Prescripteur introuvable ou retiré du TDR.', 422);
  }

  const sale = await Sale.create({
    reference: `TMP-${payload.requestKey}`,
    userId: user.id,
    location: 'PHARMACY',
    // Le nom du carnet devient le customerName si la caisse n'en a tapé aucun :
    // la liste des ventes et le ticket montrent alors le patient hospitalisé.
    customerName: payload.customerName || (patient ? patient.name : ''),
    patientId: patient ? patient.id : null,
    medicalStaffId: staff ? staff.id : null,
    total: prepared.total,
    costTotal: prepared.costTotal,
    margin: prepared.margin,
    // 2.7.79 — le « Servi par » saisi voyage en tête de la note (marqueur
    // ⟦Servi par : X⟧) ; les tickets/ordonnances le lisent et l'affichent.
    note: coudreServiPar(payload.note, payload.servedBy),
    status: STATUS.VALIDATED,
    requestKey: payload.requestKey,
    createdAt: new Date()
  }, { transaction });

  for (const line of prepared.lines) {
    await SaleLine.create({
      saleId: sale.id, productId: line.productId, lotId: line.lotId,
      // « quantity » reste en unité de gestion (boîte) ; la traçabilité de la
      // caisse est dans saleUnit / saleQuantity / unitFactor.
      saleUnit: line.saleUnit, saleQuantity: line.saleQuantity, unitFactor: line.unitFactor,
      quantity: line.quantity,
      unitPrice: line.unitPrice, unitCost: line.unitCost, marginRate: line.marginRate, margin: line.margin
    }, { transaction });
  }

  // Sortie de stock : uniquement après validation (RG04, RG05) — en équivalent-boîte.
  await applyMovements({
    documentType: 'SALE', documentId: sale.id, userId: user.id, kind: 'SALE',
    reason: payload.customerName ? `Vente — ${payload.customerName}` : 'Vente comptoir',
    lines: prepared.lines.map(line => ({
      productId: line.productId, lotId: line.lotId, location: 'PHARMACY',
      quantity: quantite(-Number(line.quantity)), unitCost: line.gestionCost
    }))
  }, transaction);

  await sale.update({ reference: makeReference('SALE', sale.id) }, { transaction });
  await log({
    userId: user.id, action: 'VALIDATE', entity: 'SALE', entityId: sale.id,
    after: { reference: sale.reference, total: prepared.total, margin: prepared.margin, lines: prepared.lines.length }
  }, transaction);

  return { sale, lines: prepared.lines };
}