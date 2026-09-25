#!/usr/bin/env node
// Contrôle d'intégrité (§12) : chaque quantité de lot doit égaler la somme de ses mouvements.
// Usage : node scripts/check-integrity.mjs   (planifier un contrôle mensuel en production)
import { sequelize, close } from '../src/config/database.js';
import { integrityReport } from '../src/services/stock.service.js';

const anomalies = await sequelize.transaction(transaction => integrityReport(transaction));
if (anomalies.length) {
  console.error(`${anomalies.length} anomalie(s) détectée(s) :`);
  console.table(anomalies);
  await close();
  process.exit(1);
}
console.log('Intégrité vérifiée : le stock de chaque lot correspond à la somme de ses mouvements.');
await close();
