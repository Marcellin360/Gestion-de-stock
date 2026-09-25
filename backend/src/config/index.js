// ============================================================================
// Configuration applicative lue depuis l'environnement (backend/.env)
// ============================================================================
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant. Copier backend/.env.example vers backend/.env puis compléter.`);
  return value;
}

export const env = process.env.NODE_ENV || 'development';

export const config = {
  env,
  production: env === 'production',
  test: env === 'test',
  port: Number(process.env.PORT || 3001),
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL === 'true',
  origin: process.env.APP_ORIGIN || 'http://localhost:5173',
  extraOrigins: String(process.env.APP_ORIGIN_EXTRA || '').split(',').map(v => v.trim()).filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === '1',
  sessionHours: Number(process.env.SESSION_HOURS || 8),
  timezone: process.env.APP_TIMEZONE || 'Indian/Antananarivo',
  currency: 'Ar',
  bcryptRounds: 12,
  cookieName: 'ps_session'
};

if (config.production && !config.origin.startsWith('https://')) {
  throw new Error('APP_ORIGIN doit utiliser HTTPS en production (ex: https://stock.mapharmacie.mg).');
}
if (config.production && config.databaseSsl === false && /supabase|cloud|render|aws|azure/i.test(config.databaseUrl)) {
  console.warn('Avertissement: DATABASE_SSL=false sur une base distante.');
}
