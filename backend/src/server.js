// ============================================================================
// Démarrage du serveur HTTP : contrôles préalables, écoute, arrêt propre.
// ============================================================================
import { VERSION_APPLI } from './utils/version.js';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { sequelize, connect, close } from './config/database.js';

async function main() {
  await connect();
  const [migrations] = await sequelize.query('SELECT version FROM schema_migrations ORDER BY version');
  if (!migrations.length) {
    throw new Error('Base non initialisée. Exécuter « npm run db:migrate » à la racine du projet.');
  }
  const app = createApp();
  const server = app.listen(config.port, '0.0.0.0', () => {
        // 2.7.61 — bannière IRRÉFUTABLE : le code, le dossier et le PID du
    // processus qui démarre. Au moindre doute « lequel de mes backends
    // répond ? », c'est ICI qu'il faut regarder (et comparer avec la sortie
    // de doctor-pdf.mjs).
    console.log(`PharmaStock — code ${VERSION_APPLI} — dossier ${process.cwd()} — PID ${process.pid}`);
    console.log(`Migrations appliquées : ${migrations.map(m => m.version).join(', ')}`);
  });

  const shutdown = signal => {
    console.log(`\n${signal} reçu : arrêt en cours…`);
    server.close(async () => { await close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => shutdown(signal));
}

main().catch(error => {
  console.error('Démarrage impossible :', error.message);
  process.exit(1);
});
