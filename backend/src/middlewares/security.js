// En-têtes de sécurité et corps JSON limité.
import helmet from 'helmet';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from '../config/index.js';

export function securityMiddleware(app) {
  app.disable('x-powered-by');
  // 2.7.25 — « trust proxy » vaut « loopback » par défaut : lorsque nginx (ou le
  // retransmetteur local) ajoute l'en-tête X-Forwarded-For, le limiteur de
  // connexion le lit sans lever d'erreur interne (sinon « erreur 500 » à
  // l'écran de connexion). TRUST_PROXY=1 force un proxy quelconque ; en
  // exposition directe, les en-têtes externes restent ignorés (loopback seul).
  app.set('trust proxy', config.trustProxy ? 1 : 'loopback');
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: config.production ? {} : { 'upgrade-insecure-requests': null }
    },
    crossOriginResourcePolicy: { policy: 'same-origin' }
  }));
  app.use(express.json({ limit: '512kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  app.use(cookieParser());
}