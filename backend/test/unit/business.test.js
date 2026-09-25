// ============================================================================
// Tests unitaires : calculs métier et règles de stock (aucune base de données).
// Exécution : npm test
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { salePrice, grossMargin } from '../../src/services/pricing.service.js';
import { pickLots, allocate } from '../../src/services/stock.service.js';
import { distributeFees, weightedAverageCost, money, D } from '../../src/utils/money.js';
import { today, addDays, dayRange, isValidDate } from '../../src/utils/dates.js';
import { reference } from '../../src/utils/ids.js';
import { toCsv } from '../../src/utils/csv.js';
import { normalizeLotNumber } from '../../src/utils/sanitize.js';
import { computeAlerts, computeStats } from '../../src/services/alert.service.js';
import { BusinessError } from '../../src/utils/errors.js';

const LOT = (over = {}) => ({
  id: 1, productId: 1, number: 'L1', status: 'AVAILABLE', quantity: 10,
  expiresOn: '2027-01-31', receivedOn: '2026-01-01', unitCost: '1000.000000', ...over
});

test('prix de vente — marge sur coût (exemple du cahier des charges §17.2)', () => {
  assert.equal(salePrice('9000', 20, 'COST', 10, 30), '10800.000000');
});

test('prix de vente — marge sur prix de vente (§17.3)', () => {
  assert.equal(salePrice('9000', 20, 'SALE', 10, 30), '11250.000000');
});

test('prix de vente — taux hors plage 10–30 % refusé (RG22)', () => {
  assert.throws(() => salePrice('9000', 9, 'COST', 10, 30), BusinessError);
  assert.throws(() => salePrice('9000', 30.01, 'COST', 10, 30), BusinessError);
  assert.throws(() => salePrice('9000', 100, 'SALE', 10, 99.99), BusinessError);
});

test('prix de vente — coût négatif refusé', () => {
  assert.throws(() => salePrice('-1', 20, 'COST', 10, 30), BusinessError);
});

test('marge brute unitaire = prix − coût retenu (§9.6)', () => {
  assert.equal(grossMargin('10800', '9000'), '1800.000000');
});

test('frais répartis au prorata de la valeur, sans perte d’arrondi (RG12)', () => {
  const lines = distributeFees([
    { quantity: 100, purchasePrice: '8000' },
    { quantity: 50, purchasePrice: '10000' }
  ], '1000');
  const total = lines.reduce((acc, line) => acc.add(D(line.allocatedFees)), D(0));
  assert.equal(total.toFixed(6), '1000.000000');
  // 1 000 Ar répartis au prorata de la valeur (800 000 / 1 300 000 puis 500 000 / 1 300 000)
  assert.equal(lines[0].allocatedFees, '615.384615');
  assert.equal(lines[0].unitCost, '8006.153846');
  assert.equal(lines[1].allocatedFees, '384.615385');
});

test('frais répartis par quantité si la valeur d’achat est nulle', () => {
  const lines = distributeFees([
    { quantity: 1, purchasePrice: '0' },
    { quantity: 3, purchasePrice: '0' }
  ], '400');
  assert.equal(lines[0].allocatedFees, '100.000000');
  assert.equal(lines[1].allocatedFees, '300.000000');
});

test('coût de revient unitaire = prix d’achat + frais attribués (§17.1)', () => {
  const [line] = distributeFees([{ quantity: 1, purchasePrice: '8000' }], '1000');
  assert.equal(line.unitCost, '9000.000000');
});

test('CMP pondéré par les quantités (§9.7, §17.5)', () => {
  assert.equal(weightedAverageCost(100, '8000', 50, '10000'), '8666.666667');
});

test('FEFO : le lot expirant le plus tôt sort en premier (RG08)', () => {
  const lots = [
    LOT({ id: 1, expiresOn: '2027-01-31', quantity: 5 }),
    LOT({ id: 2, expiresOn: '2026-12-31', quantity: 3, receivedOn: '2026-02-01' })
  ];
  const picked = allocate(lots, 4, { date: '2026-09-19' });
  assert.deepEqual(picked.map(p => [p.lot.id, p.quantity]), [[2, 3], [1, 1]]);
});

test('FEFO : expirés, bloqués et lots sans date sont exclus de la vente (RG09)', () => {
  const lots = [
    LOT({ id: 1, expiresOn: '2026-01-01' }),
    LOT({ id: 2, status: 'BLOCKED' }),
    LOT({ id: 3, expiresOn: null }),
    LOT({ id: 4, quantity: 0 })
  ];
  assert.throws(() => allocate(lots, 1, { date: '2026-09-19' }), BusinessError);
});

test('FEFO : paramètre explicite autorisant les lots expirés', () => {
  const lots = [LOT({ id: 1, expiresOn: '2026-01-01', quantity: 2 })];
  const { picked } = pickLots(lots, 2, { date: '2026-09-19', allowExpired: true });
  assert.equal(picked.length, 1);
});

test('FIFO et LIFO choisissent les lots dans l’ordre attendu (§9.8)', () => {
  const lots = [
    LOT({ id: 1, receivedOn: '2026-01-01', expiresOn: '2027-06-30', quantity: 5 }),
    LOT({ id: 2, receivedOn: '2026-08-01', expiresOn: '2027-01-31', quantity: 5 })
  ];
  assert.equal(pickLots(lots, 1, { method: 'FIFO', date: '2026-09-19' }).picked[0].lot.id, 1);
  assert.equal(pickLots(lots, 1, { method: 'LIFO', date: '2026-09-19' }).picked[0].lot.id, 2);
});

test('alertes : rupture, stock faible, expiration proche, expiré, bloqué, surstock', () => {
  const settings = { expiryDays: 90, allowExpiredSale: false, valuation: 'LOT' };
  const products = [
    { id: 1, name: 'A (rupture)', active: true, minStock: 5, maxStock: 100, unit: 'boîte' },
    { id: 2, name: 'B (faible)', active: true, minStock: 10, maxStock: 100, unit: 'boîte' },
    { id: 3, name: 'C (surstock)', active: true, minStock: 1, maxStock: 2, unit: 'boîte' }
  ];
  const lots = [
    { id: 10, productId: 2, number: 'L1', quantity: 4, expiresOn: '2027-01-01', status: 'AVAILABLE' },
    { id: 11, productId: 3, number: 'L2', quantity: 50, expiresOn: '2026-10-01', status: 'AVAILABLE' },
    { id: 12, productId: 3, number: 'L3', quantity: 5, expiresOn: '2026-01-01', status: 'AVAILABLE' },
    { id: 13, productId: 3, number: 'L4', quantity: 5, expiresOn: '2027-01-01', status: 'BLOCKED' }
  ];
  const alerts = computeAlerts({ products, lots, suppliers: [], settings, date: '2026-09-19' });
  const types = alerts.map(a => a.type);
  assert.ok(types.includes('RUPTURE'));
  assert.ok(types.includes('STOCK_FAIBLE'));
  assert.ok(types.includes('SURSTOCK'));
  assert.ok(types.includes('EXPIRE'));
  assert.ok(types.includes('EXPIRATION_PROCHE'));
  assert.ok(types.includes('LOT_BLOQUE'));
});

test('indicateurs : valeur du stock, ventes et pertes du jour', () => {
  const settings = { valuation: 'LOT' };
  const products = [{ id: 1, active: true, cmp: '1000' }];
  const lots = [{ id: 1, productId: 1, quantity: 10, unitCost: '1200', expiresOn: '2027-01-01', status: 'AVAILABLE' }];
  const documents = [
    { kind: 'SALE', status: 'VALIDATED', date: '2026-09-19T08:00:00Z', total: '5000', margin: '1500' },
    { kind: 'LOSS', status: 'VALIDATED', date: '2026-09-19T09:00:00Z', costTotal: '2400' },
    { kind: 'SALE', status: 'CANCELLED', date: '2026-09-19T10:00:00Z', total: '9999', margin: '0' }
  ];
  const stats = computeStats({ products, lots, settings, documents, date: '2026-09-19' });
  assert.equal(stats.stockValue, '12000.000000');
  assert.equal(stats.salesToday, '5000.000000');
  assert.equal(stats.marginToday, '1500.000000');
  assert.equal(stats.lossesToday, '2400.000000');
});

test('deux magasins : alertes et indicateurs calculés séparément', () => {
  const settings = { expiryDays: 90, allowExpiredSale: false, valuation: 'LOT' };
  const products = [
    { id: 1, name: 'Comptoir garni', active: true, minStock: 5, maxStock: 100, unit: 'boîte' },
    { id: 2, name: 'Réserve garnie', active: true, minStock: 5, maxStock: 100, unit: 'boîte' }
  ];
  const lots = [
    // Le comptoir n'a rien du produit 1 : rupture en pharmacie, mais pas au dépôt.
    { id: 10, productId: 1, number: 'L1', location: 'DEPOT', quantity: 40, unitCost: '1200', expiresOn: '2027-01-01', status: 'AVAILABLE' },
    // Le dépôt n'a rien du produit 2 : rupture au dépôt, mais pas en pharmacie.
    { id: 11, productId: 2, number: 'L2', location: 'PHARMACY', quantity: 40, unitCost: '1200', expiresOn: '2027-01-01', status: 'AVAILABLE' }
  ];

  const alertesDepot = computeAlerts({ products, lots, settings, date: '2026-09-19', location: 'DEPOT' });
  const alertesPharmacie = computeAlerts({ products, lots, settings, date: '2026-09-19', location: 'PHARMACY' });
  assert.ok(alertesDepot.some(a => a.type === 'RUPTURE' && a.name === 'Réserve garnie'),
    'le dépôt signale la référence absente de la réserve');
  assert.ok(!alertesDepot.some(a => a.type === 'RUPTURE' && a.name === 'Comptoir garni'),
    'le stock du comptoir ne déclenche pas d’alerte dans la réserve');
  assert.ok(alertesPharmacie.some(a => a.type === 'RUPTURE' && a.name === 'Comptoir garni'));
  assert.ok(!alertesPharmacie.some(a => a.type === 'RUPTURE' && a.name === 'Réserve garnie'));
  assert.ok(alertesDepot.every(a => a.location === 'DEPOT'));
  assert.ok(alertesPharmacie.every(a => a.location === 'PHARMACY'));

  const documents = [
    { kind: 'SALE', status: 'VALIDATED', date: '2026-09-19T08:00:00Z', total: '5000', margin: '1500', location: 'PHARMACY' },
    { kind: 'LOSS', status: 'VALIDATED', date: '2026-09-19T09:00:00Z', costTotal: '2400', location: 'DEPOT' }
  ];
  const statsDepot = computeStats({ products, lots, settings, documents, date: '2026-09-19', location: 'DEPOT' });
  const statsPharmacie = computeStats({ products, lots, settings, documents, date: '2026-09-19', location: 'PHARMACY' });
  assert.equal(statsDepot.salesToday, '0.000000', 'le dépôt ne réalise pas de chiffre d’affaires');
  assert.equal(statsPharmacie.salesToday, '5000.000000');
  assert.equal(statsDepot.lossesToday, '2400.000000', 'la perte de la réserve est comptée dans la réserve');
  assert.equal(statsPharmacie.lossesToday, '0.000000');
  assert.equal(statsDepot.stockValue, '48000.000000');
  assert.equal(statsPharmacie.stockValue, '48000.000000');
});

test('dates : fuseau de Madagascar, ajout de jours, validation', () => {
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-02-28'), true);
  const { start, end } = dayRange('2026-09-01', '2026-09-30');
  assert.equal(start.toISOString(), '2026-08-31T21:00:00.000Z');
  assert.equal(end.toISOString(), '2026-09-30T21:00:00.000Z');
});

test('références documentaires lisibles et uniques', () => {
  assert.equal(reference('RECEIPT', 42, 2026), 'REC-2026-000042');
  assert.equal(reference('SALE', 7, 2026), 'VTE-2026-000007');
  assert.equal(reference('INVENTORY', 1, 2026), 'INV-2026-000001');
});

test('export CSV : séparateur, neutralisation des formules, BOM', () => {
  const csv = toCsv([{ name: '=1+1', quantity: 2 }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.split('\r\n')[0].includes(';'), 'séparateur point-virgule attendu');
  assert.ok(csv.includes("'=1+1"), 'la formule doit être neutralisée par une apostrophe');
});

test('numéro de lot normalisé (évite les doublons incohérents, §16)', () => {
  assert.equal(normalizeLotNumber('  lot 24a 01 '), 'LOT 24A 01');
  assert.equal(normalizeLotNumber('Ab-12'), 'AB-12');
});

test('montants stockés avec 6 décimales', () => {
  assert.equal(money(8666.6666666), '8666.666667');
  assert.equal(money('0.1'), '0.100000');
});
