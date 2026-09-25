#!/usr/bin/env node
// ============================================================================
// Création du premier administrateur (à exécuter une seule fois).
// Le mot de passe est lu dans ADMIN_PASSWORD, jamais passé en argument de
// commande (il resterait dans l'historique du shell).
// ============================================================================
import bcrypt from 'bcryptjs';
import { config } from '../src/config/index.js';
import { User, Role } from '../src/models/index.js';
import { sequelize, close } from '../src/config/database.js';
import { log } from '../src/services/audit.service.js';

async function main() {
  const login = process.env.ADMIN_LOGIN || 'admin';
  const name = process.env.ADMIN_NAME || 'Administrateur';
  const password = process.env.ADMIN_PASSWORD || '';

  if (password.length < 12) throw new Error('ADMIN_PASSWORD doit contenir au moins 12 caractères.');
  const existing = await User.count();
  if (existing > 0) {
    throw new Error('Initialisation refusée : des utilisateurs existent déjà. Utiliser l’écran Utilisateurs (ou réinitialiser le mot de passe).');
  }
  const role = await Role.findOne({ where: { code: 'ADMIN' } });
  if (!role) throw new Error('Rôle ADMIN absent : exécuter « npm run db:migrate ».');

  await sequelize.transaction(async transaction => {
    const user = await User.create({
      name, login, roleId: role.id,
      passwordHash: await bcrypt.hash(password, config.bcryptRounds),
      active: true, phone: '', note: '',
      createdAt: new Date(), updatedAt: new Date()
    }, { transaction });
    await log({ userId: user.id, action: 'CREATE', entity: 'USER', entityId: user.id, after: { login, role: 'ADMIN' } }, transaction);
  });

  console.log(`Administrateur « ${login} » créé.`);
  console.log('Retirer maintenant la ligne ADMIN_PASSWORD de backend/.env.');
}

main()
  .then(() => close())
  .catch(async error => { console.error('Échec :', error.message); await close().catch(() => {}); process.exit(1); });
