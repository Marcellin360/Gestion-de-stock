// Vite : serveur de développement pour le poste de travail.
// Toutes les requêtes /api sont relayées vers le backend Express : le navigateur
// ne connaît qu'une seule origine (cookies de session et contrôle d'origine OK).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.API_TARGET || 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // Le poste de la pharmacie est accessible par son adresse locale ou par un
    // nom de domaine interne : Vite ne doit pas refuser ces en-têtes Host.
    allowedHosts: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200
  }
});
