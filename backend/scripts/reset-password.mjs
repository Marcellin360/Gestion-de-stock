#!/usr/bin/env node
// ============================================================================
// Réinitialisation d'un mot de passe (poste de l'officine uniquement).
// Cas d'usage : le seul administrateur a oublié son mot de passe, ou un compte
// doit être repris rapidement. Le mot de passe est lu dans RESET_PASSWORD,
// jamais passé en argument (il resterait dans l'historique du terminal).
// Toutes les sessions du compte sont fermées et l'opération est tracée.
//
//   Windows  : set RESET_LOGIN=admin && set RESET_PASSWORD=... && node scripts/reset-password.mjs
//   PowerShell : $env:RESET_LOGIN="admin"; $env:RESET_PASSWORD="..."; node scripts/reset-password.mjs
// ============================================================================
import bcrypt from 'bcryptjs';
import { config } from '../src/config/index.js';
import { User, Role } from '../src/models/index.js';
import { sequelize, close } from '../src/config/database.js';
import { log } from '../src/services/audit.service.js';
import { revokeSessions } from '../src/services/auth.service.js';

async function main() {
  const login = String(process.env.RESET_LOGIN || 'admin').trim();
  const password = process.env.RESET_PASSWORD || '';

  if (password.length < 4) {
    throw new Error('RESET_PASSWORD doit contenir au moins 4 caractères (exemple PowerShell : $env:RESET_PASSWORD="Pharma-2026" ; node scripts/reset-password.mjs).');
  }

  const user = await User.findOne({ where: { login }, include: [{ model: Role, as: 'role' }] });
  if (!user) throw new Error(`Aucun compte avec l’identifiant « ${login} ». Identifiants existants : ${(await User.findAll({ attributes: ['login'] })).map(u => u.login).join(', ')}.`);

  await sequelize.transaction(async transaction => {
    await user.update({ passwordHash: await bcrypt.hash(password, config.bcryptRounds), updatedAt: new Date() }, { transaction });
    await revokeSessions(user.id, transaction);
    await log({
      userId: user.id, action: 'PASSWORD', entity: 'USER', entityId: user.id,
      after: { login, role: user.role?.code, origine: 'réinitialisation locale (scripts/reset-password.mjs)' }
    }, transaction);
  });

  console.log(`Mot de passe réinitialisé pour « ${login} » (${user.role?.name || user.role?.code || 'rôle inconnu'}).`);
  console.log('Toutes ses sessions ont été fermées. Il peut se connecter avec le nouveau mot de passe.');
  console.log('Conseil : changez-le depuis l’application (👤 Mon compte) après la connexion.');
}

main()
  .then(() => close())
  .catch(async error => { console.error('Échec :', error.message); await close().catch(() => {}); process.exit(1); });