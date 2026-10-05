#!/usr/bin/env node
// ============================================================================
// Autoriser (ou interdire) l'affichage du PRIX DE VENTE au profil DÉPÔT.
//
// Par défaut, le dépôt ne voit ni le prix de vente ni la marge : il voit le coût
// (CMP) et le taux, ce qui suffit aux réceptions et aux transferts. Certaines
// officines préfèrent que le dépôt puisse lire le prix (étiquetage des boîtes,
// réponse aux questions du comptoir). Ce script ajoute alors la permission
// « prices » au rôle DEPOT.
//
//   Emploi (depuis la racine du projet) :
//       node backend/scripts/autoriser-prix-depot.mjs            → autorise
//       node backend/scripts/autoriser-prix-depot.mjs --retirer  → interdit
//       node backend/scripts/autoriser-prix-depot.mjs --etat     → affiche l'état
//
// Après l'exécution : déconnecter/reconnecter le poste du dépôt (les droits sont
// lus à l'ouverture de la session).
// ============================================================================
import { Role } from '../src/models/index.js';
import { sequelize, close } from '../src/config/database.js';
import { log } from '../src/services/audit.service.js';

const PERMISSION = 'prices';
const ROLE = 'DEPOT';

async function main() {
  const mode = process.argv.includes('--retirer') ? 'retirer'
    : process.argv.includes('--etat') ? 'etat' : 'autoriser';

  const role = await Role.findOne({ where: { code: ROLE } });
  if (!role) throw new Error(`Rôle ${ROLE} absent : exécuter « npm run db:migrate ».`);

  const avant = Array.isArray(role.permissions) ? role.permissions : [];
  const contient = avant.includes(PERMISSION);

  if (mode === 'etat') {
    console.log(`Rôle ${ROLE} — permission « ${PERMISSION} » : ${contient ? 'ACCORDÉE (le dépôt voit le prix de vente)' : 'RETIRÉE (le dépôt ne voit pas le prix de vente)'}`);
    console.log(`Droits actuels : ${avant.sort().join(', ')}`);
    return;
  }

  const apres = mode === 'autoriser'
    ? Array.from(new Set([...avant, PERMISSION]))
    : avant.filter(p => p !== PERMISSION);

  if (apres.length === avant.length) {
    console.log(`Rien à faire : la permission « ${PERMISSION} » est déjà ${mode === 'autoriser' ? 'accordée' : 'retirée'}.`);
    return;
  }

  await sequelize.transaction(async transaction => {
    await role.update({ permissions: apres }, { transaction });
    // La table audit_logs n'a pas de colonne « motif » : le motif est donc
    // enregistré dans l'instantané « après », avec l'explication dans « avant ».
    await log({
      userId: null, action: 'UPDATE', entity: 'ROLE', entityId: role.id,
      before: { permissions: avant, motif: `Prix de vente ${mode === 'autoriser' ? 'autorisé' : 'interdit'} pour le profil ${ROLE}` },
      after: { permissions: apres, motif: `Prix de vente ${mode === 'autoriser' ? 'autorisé' : 'interdit'} pour le profil ${ROLE}` }
    }, transaction);
  });

  console.log(`Rôle ${ROLE} mis à jour : permission « ${PERMISSION} » ${mode === 'autoriser' ? 'ACCORDÉE' : 'RETIRÉE'}.`);
  console.log(`Droits actuels : ${apres.sort().join(', ')}`);
  console.log('Déconnectez puis reconnectez le poste du dépôt pour appliquer le changement.');
}

main()
  .then(close)
  .catch(async error => {
    console.error('Échec :', error.message);
    await close();
    process.exitCode = 1;
  });