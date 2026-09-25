#!/usr/bin/env node
// ============================================================================
//  Fanamarinana feno : « andro iray » amin’ny rafitra DÉPÔT + PHARMACIE.
//  Mandeha amin’ny alalan’ny API (toy ny mpampiasa tena izy amin’ny navigateur),
//  ka izy no manamarina ny fahefana, ny stock roa, ny alerte sy ny rapports.
//
//  Fampiasana (amin’ny base FOLOANA, tsy makany amin’ny angona tena izy):
//      npm run setup -- --full        # na db:migrate + admin:create
//      node backend/scripts/verifier-scenario.mjs
//
//  Fepetra : NODE_ENV tsy production, base tsy misy angona (afoana ny script raha
//  efa misy réception, mba tsy hanimba ny rejistra tena izy).
// ============================================================================
import { randomUUID } from 'node:crypto';

const BASE = process.env.API_URL || 'http://127.0.0.1:3001';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.VERIFY_ADMIN_PASSWORD || '';
const MOT_DE_PASSE = 'Scenario-2026!';

let echecs = 0;
const ok = (condition, libelle, detail = '') => {
  if (condition) console.log(`  ✔ ${libelle}${detail ? ` — ${detail}` : ''}`);
  else { echecs += 1; console.error(`  ✘ ${libelle}${detail ? ` — ${detail}` : ''}`); }
};
const titre = texte => console.log(`\n=== ${texte} ===`);
const ar = v => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Ar';
const jour = n => {
  const d = new Date(Date.now() + n * 86400000);
  return d.toISOString().slice(0, 10);
};

class Session {
  constructor(nom) { this.nom = nom; this.cookie = ''; this.csrf = ''; }

  async call(methode, chemin, corps) {
    const entetes = { Origin: BASE };
    if (this.cookie) entetes.Cookie = this.cookie;
    if (corps !== undefined) entetes['Content-Type'] = 'application/json';
    if (this.csrf && methode !== 'GET') entetes['X-CSRF-Token'] = this.csrf;
    const reponse = await fetch(`${BASE}/api${chemin}`, {
      method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps)
    });
    const brut = await reponse.text();
    let donnees = null;
    try { donnees = brut ? JSON.parse(brut) : null; } catch { donnees = { html: brut }; }
    const cookie = reponse.headers.get('set-cookie');
    if (cookie) this.cookie = cookie.split(';')[0];
    return { statut: reponse.status, donnees };
  }

  async login(login, password) {
    if (this.csrf) { return this.call('POST', '/auth/login', { login, password }); }
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE },
      body: JSON.stringify({ login, password })
    });
    const cookie = r.headers.get('set-cookie');
    if (cookie) this.cookie = cookie.split(';')[0];
    const donnees = await r.json().catch(() => null);
    if (donnees?.csrf) this.csrf = donnees.csrf;
    return { statut: r.status, donnees };
  }

  get(chemin) { return this.call('GET', chemin); }
  post(chemin, corps) { return this.call('POST', chemin, corps); }
}

async function main() {
  titre('0. Fifandraisana sy fidirana');
  const sante = await fetch(`${BASE}/api/health`).then(r => r.json()).catch(() => null);
  ok(sante?.status === 'ok', 'API mandeha', `${BASE}`);
  if (!sante?.status) process.exit(1);

  const admin = new Session('admin');
  let r = await admin.login('admin', ADMIN_PASSWORD);
  ok(r.statut === 200, 'Fidirana admin', r.statut === 200 ? '' : JSON.stringify(r.donnees));
  if (r.statut !== 200) {
    console.error('  → Fenoy ny ADMIN_PASSWORD (na VERIFY_ADMIN_PASSWORD) ary avereno.');
    process.exit(1);
  }

  const donnees = (await admin.get('/data')).donnees;
  ok(!!donnees?.locations?.DEPOT && !!donnees?.locations?.PHARMACY, 'Ny magasin roa dia voasoratra ao amin’ny /api/data',
    Object.keys(donnees?.locations || {}).join(', '));
  if (donnees.receipts?.length) {
    console.error('  → Efa misy réception : atao amin’ny base foloana io fanamarinana io.');
    process.exit(1);
  }

  titre('1. Paramètres, utilisateurs, référence');
  await admin.call('PUT', '/settings', {
    ...donnees.settings, pharmacyName: 'Pharmacie Ambohipo', currency: 'Ar', marginMode: 'COST',
    minMargin: 10, maxMargin: 30, expiryDays: 90, valuation: 'LOT', allowExpiredSale: false
  });
  const roles = (await admin.get('/users/roles')).donnees;
  const listeRoles = Array.isArray(roles) ? roles : roles.list;
  const idRole = code => listeRoles.find(x => x.code === code)?.id;
  ok(listeRoles.length === 3, 'Rôle 3 ihany', listeRoles.map(x => x.code).join(' · '));
  ok(!listeRoles.some(x => ['SELLER', 'STOCK'].includes(x.code)), 'Tsy misy rôle SELLER/STOCK intsony');
  const permDepot = listeRoles.find(x => x.code === 'DEPOT').permissions;
  ok(permDepot.includes('receipt') && permDepot.includes('transfer'), 'Ny dépôt dia mahazo receipt + transfer', permDepot.join(','));
  ok(!permDepot.includes('sale'), 'Ny dépôt dia tsy mahazo sale');
  ok(listeRoles.find(x => x.code === 'PHARMACIST').permissions.includes('costs'), 'Ny pharmacien dia mahazo `costs` (coût/marge hita)');

  const pharmacien = new Session('pharmacien');
  const depot = new Session('depot');
  for (const [session, login, roleCode] of [[pharmacien, 'hery', 'PHARMACIST'], [depot, 'naina', 'DEPOT']]) {
    const cree = await admin.post('/users', {
      name: roleCode === 'DEPOT' ? 'Rakoto Naina' : 'Rasoanaivo Hery', login, roleId: idRole(roleCode),
      active: true, phone: '', note: '', password: MOT_DE_PASSE
    });
    ok(cree.statut === 201 || cree.statut === 200, `Kaonty ${login} noforonina`, String(cree.statut));
  }
  ok((await pharmacien.login('hery', MOT_DE_PASSE)).statut === 200, 'Fidirana pharmacien');
  ok((await depot.login('naina', MOT_DE_PASSE)).statut === 200, 'Fidirana dépôt');

  const categorie = (await admin.post('/categories', { name: 'Antalgiques', description: '', active: true })).donnees;
  const fournisseur = (await admin.post('/suppliers', {
    name: 'SALAMA', contact: '', phone: '', email: '', address: 'Antananarivo', nif: '', note: '', active: true
  })).donnees;
  const produits = {};
  for (const [code, name, minStock, marge] of [
    ['MED-001', 'Paracétamol 500 mg', 20, 10], ['MED-002', 'Amoxicilline 500 mg', 10, 20],
    ['MED-003', 'Ibuprofène 400 mg', 10, 20], ['MED-021', 'Sirop antitussif enfant 120 ml', 6, 25]
  ]) {
    produits[code] = (await admin.post('/products', {
      code, name, ingredient: '', dosage: '', form: '', presentation: '', barcode: null,
      categoryId: categorie.id, manufacturer: '', unit: 'boîte', minStock, maxStock: 500,
      storage: '', note: '', active: true, marginRate: marge
    })).donnees;
  }
  ok(Object.values(produits).every(Boolean), 'Catalogue 4 fanafody + 1 fournisseur');

  titre('2. Réception (dépôt) — ny entana rehetra dia miditra ao amin’ny dépôt');
  const reception = await depot.post('/receipts', {
    requestKey: randomUUID(), supplierId: fournisseur.id, fees: '40000', invoiceRef: 'FA-2026-101',
    note: 'Livraison du matin',
    lines: [
      { productId: produits['MED-001'].id, number: 'PARA-24A', quantity: 100, purchasePrice: '800', receivedOn: jour(-1), expiresOn: jour(400), manufacturedOn: null },
      { productId: produits['MED-002'].id, number: 'AMOX-24B', quantity: 40, purchasePrice: '1500', receivedOn: jour(-1), expiresOn: jour(300), manufacturedOn: null },
      { productId: produits['MED-021'].id, number: 'SIROP-24A', quantity: 20, purchasePrice: '4000', receivedOn: jour(-1), expiresOn: jour(60), manufacturedOn: null }
    ]
  });
  const enveloppeReception = reception.donnees?.receipt || reception.donnees;
  ok(reception.statut === 201, 'Réception nataon’ny kaonty dépôt', enveloppeReception?.reference);
  const refReception = enveloppeReception?.reference;
  ok(/^REC-\d{4}-\d{6}$/.test(refReception || ''), 'Référence réception', refReception);
  ok(Number(enveloppeReception?.costTotal) > 0, 'Coût total (frais voazara)', ar(enveloppeReception?.costTotal));

  const donneesDepot = (await depot.get('/data')).donnees;
  const stockDe = (d, code, magasin) => d.lots
    .filter(l => l.productId === produits[code].id && l.location === magasin)
    .reduce((t, l) => t + Number(l.quantity), 0);
  ok(stockDe(donneesDepot, 'MED-001', 'DEPOT') === 100, 'Paracétamol 100 ao amin’ny dépôt');
  ok(stockDe(donneesDepot, 'MED-001', 'PHARMACY') === 0, 'Paracétamol 0 ao amin’ny pharmacie (mbola tsy nisy transfert)');
  ok(!donneesDepot.products.some(p => p.sellingPrice !== undefined), 'Ny vidin’ny varotra dia tsy alefa amin’ny kaonty dépôt');
  ok(!donneesDepot.documents.some(d => d.kind === 'SALE'), 'Ny vente dia tsy alefa amin’ny kaonty dépôt');

  titre('3. Transfert dépôt → pharmacie');
  const reponseLots = (await depot.get('/transfers/lots')).donnees;
  const lotsDepot = Array.isArray(reponseLots) ? reponseLots : reponseLots.lots;
  const lotDe = code => lotsDepot.find(l => l.productId === produits[code].id);
  const trop = await depot.post('/transfers', {
    requestKey: randomUUID(), fromLocation: 'DEPOT', toLocation: 'PHARMACY', reason: 'Réassort du comptoir',
    note: '', lines: [{ lotId: lotDe('MED-001').id, quantity: 500 }]
  });
  ok(trop.statut === 422 || trop.statut === 400, 'Transfert mihoatra ny stock du dépôt → lavina', String(trop.statut));
  const sansMotif = await depot.post('/transfers', {
    requestKey: randomUUID(), fromLocation: 'DEPOT', toLocation: 'PHARMACY', reason: 'ab',
    note: '', lines: [{ lotId: lotDe('MED-001').id, quantity: 10 }]
  });
  ok(sansMotif.statut === 422, 'Transfert tsy misy motif → lavina', String(sansMotif.statut));

  const cle = randomUUID();
  const transfert = await depot.post('/transfers', {
    requestKey: cle, fromLocation: 'DEPOT', toLocation: 'PHARMACY', reason: 'Réassort du comptoir',
    note: 'Comptoir + réserve',
    lines: [
      { lotId: lotDe('MED-001').id, quantity: 40 },
      { lotId: lotDe('MED-002').id, quantity: 15 },
      { lotId: lotDe('MED-021').id, quantity: 10 }
    ]
  });
  ok(transfert.statut === 201, 'Transfert nataon’ny dépôt', transfert.donnees?.reference || transfert.donnees?.transfer?.reference);
  ok(/^TRF-\d{4}-\d{6}$/.test(transfert.donnees?.reference || transfert.donnees?.transfer?.reference || ''), 'Référence transfert');
  const transfertBis = await depot.post('/transfers', {
    requestKey: cle, fromLocation: 'DEPOT', toLocation: 'PHARMACY', reason: 'Réassort du comptoir',
    note: 'Comptoir + réserve',
    lines: [
      { lotId: lotDe('MED-001').id, quantity: 40 },
      { lotId: lotDe('MED-002').id, quantity: 15 },
      { lotId: lotDe('MED-021').id, quantity: 10 }
    ]
  });
  ok(transfertBis.donnees?.transfer?.id === transfert.donnees?.transfer?.id,
    'Fikandrana indray (double clic) → transfert iray ihany', `id ${transfert.donnees?.id || transfert.donnees?.transfer?.id}`);

  const donneesApresTransfert = (await pharmacien.get('/data')).donnees;
  ok(stockDe(donneesApresTransfert, 'MED-001', 'DEPOT') === 60, 'Dépôt 100 → 60');
  ok(stockDe(donneesApresTransfert, 'MED-001', 'PHARMACY') === 40, 'Pharmacie 0 → 40');
  const lotJumeau = donneesApresTransfert.lots.filter(l => l.number === 'PARA-24A');
  ok(lotJumeau.length === 2
    && lotJumeau[0].unitCost === lotJumeau[1].unitCost
    && lotJumeau[0].expiresOn === lotJumeau[1].expiresOn,
    'Lot jumeau : mitovy numéro, daty péremption sy coût');

  titre('4. Ventes (pharmacie ihany)');
  const venteDepot = await depot.post('/sales', {
    requestKey: randomUUID(), customerName: '', note: '',
    lines: [{ productId: produits['MED-001'].id, quantity: 1 }]
  });
  ok(venteDepot.statut === 403, 'Kaonty dépôt mivarotra → lavina (403)', String(venteDepot.statut));

  const devis = await pharmacien.post('/sales/quote', {
    requestKey: randomUUID(), note: '', lines: [{ productId: produits['MED-001'].id, quantity: 3 }]
  });
  ok(devis.statut === 200, 'Devis vente (FEFO)',
    devis.donnees?.lines ? `${ar(devis.donnees.total)} · lot ${devis.donnees.lines[0]?.lot} (exp. ${devis.donnees.lines[0]?.expiresOn})` : '');
  const vente = await pharmacien.post('/sales', {
    requestKey: randomUUID(), expectedTotal: devis.donnees?.total, customerName: 'Randria Soa', note: '',
    lines: [{ productId: produits['MED-001'].id, quantity: 3 }]
  });
  ok(vente.statut === 201, 'Vente nosoratana', vente.donnees?.sale?.reference);
  const venteTrop = await pharmacien.post('/sales', {
    requestKey: randomUUID(), customerName: '', note: '',
    lines: [{ productId: produits['MED-001'].id, quantity: 500 }]
  });
  ok(venteTrop.statut === 422 || venteTrop.statut === 409, 'Vente mihoatra ny stock du comptoir → lavina', String(venteTrop.statut));

  const donneesApresVente = (await pharmacien.get('/data')).donnees;
  ok(stockDe(donneesApresVente, 'MED-001', 'PHARMACY') === 37, 'Pharmacie 40 → 37 (vente 3)');
  ok(stockDe(donneesApresVente, 'MED-001', 'DEPOT') === 60, 'Dépôt tsy nihetsika (60) — ny vente tsy mikitika ny dépôt');
  ok(Number(donneesApresVente.locations.PHARMACY.stats.salesToday) > 0, 'Ventes du jour (pharmacie)', ar(donneesApresVente.locations.PHARMACY.stats.salesToday));
  ok(Number(donneesApresVente.locations.DEPOT.stats.salesToday) === 0, 'Ventes du jour (dépôt) = 0,00 Ar');

    // Contrat de l’écran de vente : le navigateur envoie `quantity`. L’ancien nom
  // `quantite` (bug corrigé en 2.7.2) doit être refusé AVEC un message clair.
  const fauteDeChamp = await pharmacien.post('/sales/quote', {
    note: '', lines: [{ productId: produits['MED-001'].id, quantite: 1 }]
  });
  ok(fauteDeChamp.statut === 422 && /quantity/.test(fauteDeChamp.donnees?.error || ''),
    'Panier misy « quantite » → lavina misy fanazavana (tokony « quantity »)',
    (fauteDeChamp.donnees?.error || '').slice(0, 120));

  titre('5. Pertes : magasin tsirairay manana ny taratasiny');
  const lotPharma = donneesApresVente.lots.find(l => l.productId === produits['MED-021'].id && l.location === 'PHARMACY');
  const pertePharmacie = await pharmacien.post('/losses', {
    requestKey: randomUUID(), location: 'PHARMACY', reason: 'Casse',
    note: 'Flacon de sirop renversé au comptoir', lines: [{ lotId: lotPharma.id, quantity: 1 }]
  });
  ok(pertePharmacie.statut === 201, 'Perte pharmacie', pertePharmacie.donnees?.loss?.reference);
  const perteDepot = await depot.post('/losses', {
    requestKey: randomUUID(), location: 'DEPOT', reason: 'Détérioration',
    note: 'Carton de paracétamol écrasé dans la réserve', lines: [{ lotId: lotDe('MED-001').id, quantity: 2 }]
  });
  ok(perteDepot.statut === 201, 'Perte dépôt', perteDepot.donnees?.loss?.reference);
  const perteSansMagasin = await depot.post('/losses', {
    requestKey: randomUUID(), reason: 'Casse', note: 'tsy misy magasin', lines: [{ lotId: lotDe('MED-001').id, quantity: 1 }]
  });
  ok(perteSansMagasin.statut === 422, 'Perte tsy misy `location` → lavina', String(perteSansMagasin.statut));

  titre('6. Inventaires : magasin tsirairay');
  const invPharma = await pharmacien.post('/inventories', { location: 'PHARMACY', scope: 'Rayon comptoir', note: 'Comptage du soir' });
  const inventairePharma = invPharma.donnees?.inventory || invPharma.donnees;
  ok(invPharma.statut === 201, 'Inventaire pharmacie misokatra', inventairePharma?.reference);
  const detail = (await pharmacien.get(`/inventories/${inventairePharma.id}`)).donnees;
  const lignes = detail.lines.map(l => ({ id: l.id, physical: Number(l.theoretical), reason: '' }));
  const cible = lignes.findIndex(l => l.physical >= 3);
  lignes[cible].physical -= 1;
  const sansJustification = await pharmacien.post(`/inventories/${inventairePharma.id}/validate`, {
    requestKey: randomUUID(), note: '', lines: lignes
  });
  ok(sansJustification.statut === 422, 'Écart tsy misy fanamarinana → lavina', String(sansJustification.statut));
  lignes[cible].reason = 'Boîte ouverte, unité manquante constatée au comptage';
  const valide = await pharmacien.post(`/inventories/${inventairePharma.id}/validate`, {
    requestKey: randomUUID(), note: 'Comptage du soir', lines: lignes
  });
  ok(valide.statut === 200, 'Inventaire pharmacie voamarina', `écart ${valide.donnees?.gaps} · ${ar(valide.donnees?.value)}`);

  const invDepot = await depot.post('/inventories', { location: 'DEPOT', scope: 'Réserve', note: 'Comptage hebdomadaire' });
  const inventaireDepot = invDepot.donnees?.inventory || invDepot.donnees;
  const detailDepot = (await depot.get(`/inventories/${inventaireDepot.id}`)).donnees;
  const lignesDepot = detailDepot.lines.map(l => ({ id: l.id, physical: Number(l.theoretical), reason: '' }));
  const valideDepot = await depot.post(`/inventories/${inventaireDepot.id}/validate`, {
    requestKey: randomUUID(), note: 'Conforme', lines: lignesDepot
  });
  ok(valideDepot.statut === 200 && valideDepot.donnees?.gaps === 0, 'Inventaire dépôt voamarina (0 écart)');

  titre('7. Alerte sy notification (lany sy saika lany daty)');
  const final = (await pharmacien.get('/data')).donnees;
  const alertesPharmacie = final.locations.PHARMACY.alerts;
  const alertesDepot = final.locations.DEPOT.alerts;
  ok(alertesPharmacie.some(a => a.type === 'EXPIRATION_PROCHE'), 'Alerte « ho lany daty » ao amin’ny pharmacie',
    (alertesPharmacie.find(a => a.type === 'EXPIRATION_PROCHE')?.title || ''));
  ok(alertesDepot.some(a => a.type === 'RUPTURE' || a.type === 'STOCK_FAIBLE'),
    'Alerte stock ao amin’ny dépôt (zavatra tsy mbola nafindra)',
    (alertesDepot.find(a => ['RUPTURE', 'STOCK_FAIBLE'].includes(a.type))?.title || ''));
  ok(alertesPharmacie.every(a => a.location === 'PHARMACY') && alertesDepot.every(a => a.location === 'DEPOT'),
    'Samy manana ny alerte-ny ny magasin roa');

  titre('8. Rapports : fiche roa, historique, transferts');
  const periode = `from=${jour(-7)}&to=${jour(0)}`;
  const fichePharma = (await admin.get(`/reports?type=fiche&${periode}`)).donnees;
  const ficheDepot = (await admin.get(`/reports?type=fiche_depot&${periode}`)).donnees;
  ok(fichePharma.rows.length > 0 && ficheDepot.rows.length > 0, 'Fiche 2 (PHARMACIE + DÉPÔT) azo');
  ok(Number(fichePharma.totals.final) === stockTotal(final, 'PHARMACY'), 'Fiche pharmacie = stock réelle',
    `${fichePharma.totals.final} unités`);
  ok(Number(ficheDepot.totals.final) === stockTotal(final, 'DEPOT'), 'Fiche dépôt = stock réelle',
    `${ficheDepot.totals.final} unités`);
  const lignePara = fichePharma.rows.find(l => l['Code'] === 'MED-001');
  ok(Number(lignePara['Entrées']) === 40 && Number(lignePara['Sorties']) === 3 && Number(lignePara['Stock final']) === 37,
    'Fiche pharmacie / Paracétamol : entrées 40 · sorties 3 · final 37',
    `${lignePara['Stock initial']} → ${lignePara['Stock final']}`);
  const ligneParaDepot = ficheDepot.rows.find(l => l['Code'] === 'MED-001');
  ok(Number(ligneParaDepot['Entrées']) === 100 && Number(ligneParaDepot['Sorties']) === 42 && Number(ligneParaDepot['Stock final']) === 58,
    'Fiche dépôt / Paracétamol : entrées 100 · sorties 42 (transfert + perte) · final 58');

  const suivante = await admin.get(`/reports?type=fiche&from=${jour(1)}&to=${jour(2)}`);
  const initialSuivant = Number(suivante.donnees.rows.find(l => l['Code'] === 'MED-001')['Stock initial']);
  ok(initialSuivant === Number(lignePara['Stock final']),
    'Report automatique : stock initial = stock final taloha', `${lignePara['Stock final']} → ${initialSuivant}`);

  const transferts = (await admin.get(`/reports?type=transfers&${periode}`)).donnees;
  ok(transferts.rows.length === 3, 'Rapport « Transferts dépôt → pharmacie »', `${transferts.rows.length} andalana`);
  const ventes = (await admin.get(`/reports?type=sales&${periode}`)).donnees;
  ok(ventes.rows.length >= 1, 'Historique de vente (pharmacie)', `${ventes.rows.length} andalana`);
  const symbole = await admin.get('/reports?type=returns');
  ok(symbole.statut === 422, 'Rapport « returns » (nesorina) → lavina', String(symbole.statut));

  titre('9. Bordereau, intégrité, audit, tsy misy commande/retour');
  const idTransfert = transfert.donnees?.id || transfert.donnees?.transfer?.id;
  const bordereau = await admin.get(`/documents/TRANSFER/${idTransfert}/print`);
  ok(typeof bordereau.donnees?.html === 'string' && bordereau.donnees.html.length > 200,
    'Bordereau de transfert azo pirinty', `${bordereau.donnees?.html?.length || 0} caractères`);
  const integrite = (await admin.get('/audit/integrity')).donnees;
  ok(!integrite.report || integrite.report.length === 0, 'Intégrité : lot = suma mouvements',
    JSON.stringify(integrite.report || []).slice(0, 80));
  ok((await admin.get('/orders')).statut === 404, 'Ny /api/orders dia tsy misy intsony (404)');
  ok((await admin.get('/returns')).statut === 404, 'Ny /api/returns dia tsy misy intsony (404)');
  const audit = (await admin.get('/audit?limit=200')).donnees;
  const lignesAudit = Array.isArray(audit) ? audit : audit.logs;
  ok(lignesAudit.some(l => l.entity === 'TRANSFER'), 'Journal d’audit : misy hetsika TRANSFER');

  titre('VALINY');
  console.log(`  Isa farany — dépôt ${stockTotal(final, 'DEPOT')} unités · pharmacie ${stockTotal(final, 'PHARMACY')} unités`);
  console.log(`  ${echecs === 0 ? '✔ MAHAFAKATRA NY ZAVATRA REHETRA' : `✘ MISY HADISOANA ${echecs}`}`);
  process.exit(echecs === 0 ? 0 : 1);
}

const stockTotal = (donnees, magasin) => donnees.lots
  .filter(l => l.location === magasin)
  .reduce((t, l) => t + Number(l.quantity), 0);

main().catch(erreur => {
  console.error('ÉCHEC :', erreur);
  process.exit(1);
});
