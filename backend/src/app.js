// ============================================================================
// Application Express : sécurité, API, puis interface web compilée (frontend/dist).
// ============================================================================
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { securityMiddleware } from './middlewares/security.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { apiRoutes } from './routes/index.js';
import { config } from './config/index.js';

export function createApp() {
  const app = express();
  securityMiddleware(app);
  app.use('/api', apiRoutes());

  // Interface web compilée (npm run build). En développement, Vite sert le frontend
  // et relaie /api vers ce serveur.
  const clientDir = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
  app.use(express.static(clientDir, { maxAge: config.production ? '1h' : 0 }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDir, 'index.html'), error => {
      if (error) res.status(404).send('Interface non compilée. Exécuter « npm run build » à la racine du projet.');
    });
  });

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
export default app;
