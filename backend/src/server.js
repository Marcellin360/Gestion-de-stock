// ============================================================================
// Démarrage du serveur HTTP : contrôles préalables, écoute, arrêt propre.
// ============================================================================
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
    console.log(`PharmaStock — API et interface sur le port ${config.port} (${config.env})`);
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
