// ============================================================================
// Paramètres de la pharmacie (RG13, RG21, RG22) : un seul enregistrement (id = 1).
// ============================================================================
import { Setting, Movement, Product } from '../models/index.js';
import { D } from '../utils/money.js';
import { recomputeProductCosting } from './pricing.service.js';
import { ensure } from '../utils/errors.js';
import { log, publicSnapshot } from './audit.service.js';

export async function getSettings(transaction) {
  const row = await Setting.findByPk(1, { transaction });
  ensure(row, 'Paramètres absents. Exécuter « npm run db:migrate » puis « npm run admin:create ».', 500);
  return row;
}

export const settingsValues = async transaction => (await getSettings(transaction)).toJSON();

/**
 * Mise à jour des paramètres.
 * La méthode de valorisation est figée dès le premier mouvement : la changer
 * après coup fausserait l'historique des coûts (§9.7) et exige une migration comptable.
 */
export async function updateSettings(values, user, transaction) {
  const current = await getSettings(transaction);
  delete values.id;          // champs techniques renvoyés par l'API, jamais écrits
  delete values.updatedAt;
  // Un champ absent du formulaire ne doit pas écraser la valeur en base
  // (cas de pricingBasis avec une interface plus ancienne que le serveur).
  for (const [cle, valeur] of Object.entries(values)) if (valeur === undefined) delete values[cle];
  const before = current.toJSON();
  if (values.valuation !== current.valuation) {
    const movements = await Movement.count({ transaction });
    ensure(movements === 0,
      'Méthode de valorisation figée après le premier mouvement : une migration comptable est nécessaire.', 409);
  }
  await current.update({ ...values, updatedAt: new Date() }, { transaction });

  // 2.7.48 — « Taux de marge » UNIQUE (Paramètres : un seul champ, min = max) :
  // le taux choisi s'applique à TOUS les médicaments et le prix de chaque fiche
  // est recalculé TOUT DE SUITE (PV = coût × (1 + taux)). Un envoi ancien en
  // plage (min ≠ max, ex. recalibrage technique) ne touche pas les marginRate.
  const tauxUnique = values.minMargin !== undefined && values.maxMargin !== undefined
    && D(values.minMargin).eq(D(values.maxMargin));
  const tauxChange = tauxUnique
    && !(D(before.minMargin).eq(values.minMargin) && D(before.maxMargin).eq(values.maxMargin));
  if (tauxChange) {
    const reglages = current.toJSON();
    for (const produit of await Product.findAll({ transaction })) {
      await produit.update({ marginRate: values.minMargin, updatedAt: new Date() }, { transaction });
      await recomputeProductCosting(produit.id, reglages, {
        userId: user.id, origin: 'PARAMETRES',
        reason: `Taux de marge unique réglé à ${values.minMargin} % (Paramètres)`
      }, transaction);
    }
  }

  // Changer la base du prix de vente, ou le mode de calcul de la marge, doit
  // s'appliquer TOUT DE SUITE aux fiches déjà enregistrées : sinon le catalogue
  // continuerait d'afficher les anciens prix jusqu'à la prochaine réception.
  const prixImpacte = (values.pricingBasis && values.pricingBasis !== before.pricingBasis)
    || (values.marginMode && values.marginMode !== before.marginMode);
  if (prixImpacte) {
    const reglages = current.toJSON();
    for (const produit of await Product.findAll({ transaction })) {
      // Une fiche sans réception (CMP = 0) n'a pas de prix à recalculer.
      if (D(produit.cmp).lte(0)) continue;
      await recomputeProductCosting(produit.id, reglages, {
        userId: user.id, origin: 'PARAMETRES',
        reason: 'Changement du réglage des prix de vente (Paramètres)'
      }, transaction);
    }
  }

  await log({
    userId: user.id, action: 'UPDATE', entity: 'SETTINGS', entityId: 1,
    before: publicSnapshot(before), after: publicSnapshot(values)
  }, transaction);
  return current;
}