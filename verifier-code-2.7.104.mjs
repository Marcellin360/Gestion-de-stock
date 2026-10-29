import { readFileSync } from 'node:fs';
const controles = [
  ['frontend/src/pages/DashboardPage.jsx', 'dboard__overview'],
  ['frontend/src/pages/DashboardPage.jsx', '<DashboardSalesTrend />'],
  ['frontend/src/pages/DashboardPage.jsx', 'dboard__shortcuts'],
  ['frontend/src/pages/DashboardPage.jsx', '<SalesHistogram />'],
  ['frontend/src/pages/DashboardPage.jsx', '<DepotFlowChart />'],
  ['frontend/src/components/DashboardSalesTrend.jsx', 'dashboard.salesCalendar'],
  ['frontend/src/components/DashboardSalesTrend.jsx', "timeZone: 'Indian/Antananarivo'"],
  ['frontend/src/styles.css', '2.7.104 — composition proche de la maquette'],
  ['backend/src/utils/version.js', "'2.7.104'"]
];
let erreurs = 0;
for (const [f, repere] of controles) {
  try { if (!readFileSync(new URL(f, import.meta.url), 'utf8').includes(repere)) throw new Error('repère manquant'); console.log(`✓ ${f} : ${repere}`); }
  catch (e) { erreurs++; console.log(`✗ ${f} : ${repere} (${e.message})`); }
}
console.log(erreurs ? `${erreurs} erreur(s)` : '2.7.104 : tous les repères présents');
process.exitCode = erreurs ? 1 : 0;