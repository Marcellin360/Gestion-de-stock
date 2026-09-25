// En-têtes de sécurité et corps JSON limité.
import helmet from 'helmet';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from '../config/index.js';

export function securityMiddleware(app) {
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
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
