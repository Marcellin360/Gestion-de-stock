#!/usr/bin/env node
// ============================================================================
// Comptes de démonstration (essais uniquement).
// Crée les DEUX profils métier du projet : le pharmacien (comptoir : ventes,
// stock de la pharmacie) et le gestionnaire du dépôt (réserve : réceptions,
// transferts vers la pharmacie). Le dépôt est un utilisateur à part entière.
// ALLOW_DEMO=true est obligatoire et la commande est refusée en production :
// ces comptes ne doivent jamais rester actifs dans une officine en service.
// La commande est idempotente : un identifiant déjà présent est simplement ignoré.
// ============================================================================
import bcrypt from 'bcryptjs';
import { config, env } from '../src/config/index.js';
import { User, Role } from '../src/models/index.js';
import { sequelize, close } from '../src/config/database.js';
import { log } from '../src/services/audit.service.js';

const COMPTES = [
  { login: 'pharmacien', name: 'Rasoanaivo Hery (démonstration)', role: 'PHARMACIST', password: 'Pharmacien-2026!', phone: '+261 34 00 000 01' },
  { login: 'depot', name: 'Rakoto Naina — dépôt (démonstration)', role: 'DEPOT', password: 'Depot-2026!', phone: '+261 34 00 000 02' }
];

async function main() {
  if (process.env.ALLOW_DEMO !== 'true' || config.production) {
    throw new Error('Comptes de démonstration refusés : ALLOW_DEMO=true et NODE_ENV différent de « production » sont exigés.');
  }
  const created = [];
  const ignored = [];

  await sequelize.transaction(async transaction => {
    for (const compte of COMPTES) {
      const role = await Role.findOne({ where: { code: compte.role }, transaction });
      if (!role) throw new Error(`Rôle ${compte.role} absent : exécuter « npm run db:migrate ».`);

      const existing = await User.findOne({ where: { login: compte.login }, transaction });
      if (existing) { ignored.push(compte.login); continue; }

      const user = await User.create({
        name: compte.name, login: compte.login, roleId: role.id,
        passwordHash: await bcrypt.hash(compte.password, config.bcryptRounds),
        active: true, phone: compte.phone, note: 'Compte de démonstration — à désactiver après les essais.',
        createdAt: new Date(), updatedAt: new Date()
      }, { transaction });

      await log({
        userId: user.id, action: 'CREATE', entity: 'USER', entityId: user.id,
        after: { login: compte.login, role: compte.role, demonstration: true }
      }, transaction);
      created.push(compte);
    }
  });

  if (created.length) {
    console.log('Comptes de démonstration créés (environnement : ' + env + ') :');
    console.log('');
    console.log('  IDENTIFIANT      MOT DE PASSE            RÔLE');
    for (const compte of created) {
      console.log(`  ${compte.login.padEnd(16)} ${compte.password.padEnd(22)} ${compte.role}`);
    }
    console.log('');
    console.log('À faire après les essais : écran Utilisateurs → désactiver ces comptes');
    console.log('(aucune suppression n’est possible : la traçabilité exige de conserver l’historique),');
    console.log('puis passer ALLOW_DEMO=false dans backend/.env.');
  }
  if (ignored.length) console.log(`Déjà présents, non modifiés : ${ignored.join(', ')}.`);
  if (!created.length && !ignored.length) console.log('Aucun compte de démonstration à créer.');
}

main()
  .then(() => close())
  .catch(async error => { console.error('Échec :', error.message); await close().catch(() => {}); process.exit(1); });
