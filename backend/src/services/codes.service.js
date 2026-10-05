// ============================================================================
// Identifiants automatiques du catalogue.
//
// Le code interne (ex. MED-007) et le code-barres ne sont PLUS saisis à la main :
// ils sont calculés ici, au moment de l'enregistrement d'un nouveau médicament.
//   • le code interne suit la série MED-001, MED-002, … sans réutiliser un
//     numéro déjà attribué (les fiches désactivées comptent aussi) ;
//   • le code-barres est un code interne EAN-13 valide (préfixe 200, réservé aux
//     usages internes : jamais distribué par un fabricant), donc lisible par
//     n'importe quel lecteur de douchette.
//
// Un import de fichier peut encore fournir ses propres valeurs : elles sont
// alors conservées telles quelles (voir reference.controller.js).
// ============================================================================
import { sequelize } from '../config/database.js';
import { Product } from '../models/index.js';

const PREFIXE_CODE = 'MED-';
const PREFIXE_BARRES = '200'; // 3 chiffres + 9 chiffres + 1 clé = 13

/** Code interne suivant : MED-001, MED-002, MED-003… */
export async function prochainCodeProduit(transaction) {
  const [rows] = await sequelize.query(
    `SELECT COALESCE(MAX(SUBSTRING(code FROM 5)::int), 0) AS dernier
       FROM products
      WHERE code ~ '^MED-[0-9]+$'`,
    { transaction }
  );
  let suivant = Number(rows[0]?.dernier || 0) + 1;
  for (;;) {
    const code = PREFIXE_CODE + String(suivant).padStart(3, '0');
    const dejaPris = await Product.count({ where: { code }, transaction });
    if (!dejaPris) return code;
    suivant += 1;
  }
}

/** Clé de contrôle EAN-13 (la 13e case), calculée sur les 12 premiers chiffres. */
export function cleControleEan13(base12) {
  let somme = 0;
  for (let i = 0; i < 12; i += 1) somme += Number(base12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (somme % 10)) % 10);
}

/** Code-barres interne suivant (13 chiffres, unique, clé EAN-13 valide). */
export async function prochainCodeBarres(transaction) {
  const [rows] = await sequelize.query(
    'SELECT COUNT(*)::int AS total FROM products WHERE barcode IS NOT NULL',
    { transaction }
  );
  let rang = Number(rows[0]?.total || 0) + 1;
  for (;;) {
    const base = PREFIXE_BARRES + String(rang).padStart(9, '0');
    const code = base + cleControleEan13(base);
    const dejaPris = await Product.count({ where: { barcode: code }, transaction });
    if (!dejaPris) return code;
    rang += 1;
  }
}