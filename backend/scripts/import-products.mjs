#!/usr/bin/env node
// ============================================================================
//  Import du catalogue depuis un fichier CSV (usage réel : une officine a
//  plusieurs centaines de médicaments ; la saisie se fait une fois dans Excel,
//  puis l'import crée tout d'un coup).
//
//  Usage :
//    npm run import:products -- "C:\pharmastock\backend\samples\catalogue-exemple.csv"
//    npm run import:products -- mes-produits.csv --dry-run     (simulation, rien écrit)
//    npm run import:products -- mes-produits.csv --update      (met à jour les codes existants)
//    npm run import:products -- mes-produits.csv --sep ,       (séparateur virgule)
//
//  Sous PowerShell, si une option est absorbée par npm, utiliser les variables :
//    $env:IMPORT_UPDATE="true"; npm run import:products -- mes-produits.csv
//
//  Colonnes attendues (ligne d'en-tête obligatoire, ordre libre, accents et
//  majuscules sans importance) — toutes sauf « code » et « nom » sont facultatives :
//    code ; nom ; categorie ; principe_actif ; dosage ; forme ; presentation ;
//    code_barres ; laboratoire ; unite ; seuil_min ; seuil_max ; conservation ;
//    taux_marge
//
//  Remarques importantes :
//   • Le fichier doit être enregistré en UTF-8 (Excel : « CSV UTF-8 »), sinon les
//     accents et les caractères malgaches sont abîmés.
//   • Les catégories absentes sont créées automatiquement.
//   • Les prix d'ACHAT ne sont pas dans ce fichier : ils viennent des réceptions
//     (chaque lot a son prix réel). Le prix de vente est calculé automatiquement
//     par l'application à partir du prix d'achat et du taux de marge.
//   • Un code déjà présent est ignoré (ou mis à jour avec --update) : l'import
//     peut être relancé sans créer de doublons.
// ============================================================================
import { readFile, access } from 'node:fs/promises';
import { isAbsolute, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config/index.js';
import { sequelize, close } from '../src/config/database.js';
import { Category, Product, Setting } from '../src/models/index.js';
import { productSchema } from '../src/validators/reference.validator.js';
import { assertMarginRate } from '../src/services/pricing.service.js';
import { log } from '../src/services/audit.service.js';

const COLONNES = {
  code: ['code', 'code_produit', 'reference'],
  nom: ['nom', 'nom_medicament', 'medicament', 'designation', 'libelle'],
  categorie: ['categorie', 'category', 'famille'],
  principe_actif: ['principe_actif', 'principe', 'molécule', 'molecule', 'dci'],
  dosage: ['dosage'],
  forme: ['forme', 'forme_galenique'],
  presentation: ['presentation', 'conditionnement'],
  code_barres: ['code_barres', 'codebarres', 'barcode', 'ean'],
  laboratoire: ['laboratoire', 'manufacturer', 'fabricant'],
  unite: ['unite', 'unité', 'unit'],
  seuil_min: ['seuil_min', 'seuil_minimum', 'stock_min', 'minimum'],
  seuil_max: ['seuil_max', 'seuil_maximum', 'stock_max', 'maximum'],
  conservation: ['conservation', 'stockage', 'condition_conservation'],
  taux_marge: ['taux_marge', 'marge', 'margin', 'margin_rate']
};

const sansAccent = texte => texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const CLE = new Map();
for (const [champ, alias] of Object.entries(COLONNES)) for (const nom of alias) CLE.set(sansAccent(nom), champ);

// ------------------------------------------------------------------ arguments
const args = process.argv.slice(2);
const option = (...noms) => {
  for (const nom of noms) {
    const i = args.findIndex(a => a === `--${nom}`);
    if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
  }
  return null;
};
const drapeau = (...noms) => noms.some(nom => args.includes(`--${nom}`));
// npm peut intercepter certaines options (--update, --dry-run…) : chacune est donc
// également disponible en variable d'environnement (pratique sous Windows/PowerShell).
const vrai = nom => String(process.env[nom] || '').toLowerCase() === 'true';
const simulation = drapeau('dry-run', 'simulation') || vrai('IMPORT_DRY_RUN');
const miseAJour = drapeau('update', 'maj') || vrai('IMPORT_UPDATE');
const cheminDonne = option('file', 'fichier') || process.env.IMPORT_FILE
  || args.find(a => !a.startsWith('--') && /\.csv$/i.test(a));
const separateurForce = option('sep', 'separator') || process.env.IMPORT_SEP || null;

const c = { v: '\u001b[32m', j: '\u001b[33m', r: '\u001b[31m', g: '\u001b[1m', f: '\u001b[0m' };

if (!cheminDonne) {
  console.error(`\n${c.r}Indiquer le fichier CSV à importer.${c.f}`);
  console.error('Exemple :  npm run import:products -- "backend/samples/catalogue-exemple.csv"\n');
  process.exit(1);
}
// Le chemin peut être écrit depuis la racine du projet (« backend/samples/… ») ou
// depuis backend (« samples/… ») : les deux sont essayés, dans cet ordre.
const racineBackend = dirname(dirname(fileURLToPath(import.meta.url)));
const racineProjet = dirname(racineBackend);
const existe = chemin => access(chemin).then(() => true, () => false);

async function trouverFichier(demande) {
  if (isAbsolute(demande)) return demande;
  const candidats = [
    resolve(process.cwd(), demande),
    resolve(racineProjet, demande),
    resolve(racineBackend, demande),
    resolve(racineProjet, 'backend', demande)
  ];
  for (const candidat of candidats) if (await existe(candidat)) return candidat;
  return candidats[0];
}
const chemin = await trouverFichier(cheminDonne);

// ------------------------------------------------------- lecture et découpage
/** Découpe une ligne CSV en respectant les guillemets ("nom ; avec ; points-virgules"). */
function decouper(ligne, sep) {
  const valeurs = [];
  let courant = '';
  let entreGuillemets = false;
  for (let i = 0; i < ligne.length; i += 1) {
    const caractere = ligne[i];
    if (caractere === '"') {
      if (entreGuillemets && ligne[i + 1] === '"') { courant += '"'; i += 1; }
      else entreGuillemets = !entreGuillemets;
    } else if (caractere === sep && !entreGuillemets) {
      valeurs.push(courant); courant = '';
    } else courant += caractere;
  }
  valeurs.push(courant);
  return valeurs.map(v => v.trim());
}

function analyser(contenu) {
  const texte = contenu.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lignes = texte.split('\n').filter(l => l.trim() !== '');
  if (lignes.length < 2) throw new Error('Fichier vide ou sans ligne de données (l’en-tête et au moins un médicament sont nécessaires).');
  const entete = lignes[0];
  const sep = separateurForce || ((entete.split(';').length >= entete.split(',').length) ? ';' : ',');
  const champs = decouper(entete, sep).map(colonne => CLE.get(sansAccent(colonne)) || null);
  const manquants = ['code', 'nom'].filter(champ => !champs.includes(champ));
  if (manquants.length) {
    throw new Error(`Colonnes obligatoires absentes : ${manquants.join(', ')}. `
      + `En-tête attendu par exemple : code;nom;categorie;principe_actif;dosage;forme;presentation;laboratoire;unite;seuil_min;taux_marge`);
  }
  const donnees = lignes.slice(1).map((ligne, index) => {
    const valeurs = decouper(ligne, sep);
    const objet = {};
    champs.forEach((champ, position) => { if (champ) objet[champ] = valeurs[position] ?? ''; });
    return { ligne: index + 2, valeurs: objet };
  });
  return { sep, donnees };
}

const entier = (valeur, defaut) => {
  if (valeur === undefined || valeur === null || String(valeur).trim() === '') return defaut;
  const nombre = Number(String(valeur).replace(/[^\d-]/g, ''));
  return Number.isFinite(nombre) ? Math.trunc(nombre) : defaut;
};
const taux = (valeur, defaut) => {
  if (valeur === undefined || valeur === null || String(valeur).trim() === '') return defaut;
  const nombre = Number(String(valeur).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(nombre) ? nombre : defaut;
};

async function main() {
  const brut = await readFile(chemin, 'utf8').catch(erreur => {
    throw new Error(`Fichier illisible (${chemin}) : ${erreur.code === 'ENOENT' ? 'introuvable' : erreur.message}`);
  });
  const { sep, donnees } = analyser(brut);
  const reglages = await Setting.findByPk(1);
  if (!reglages) throw new Error('Paramètres absents : exécuter d’abord « npm run db:migrate ».');

  console.log(`\n${c.g}=== Import du catalogue ===${c.f}`);
  console.log(`  Fichier     : ${chemin}`);
  console.log(`  Séparateur  : « ${sep} »   ·   lignes de données : ${donnees.length}`);
  console.log(`  Mode        : ${simulation ? 'SIMULATION (aucune écriture)' : miseAJour ? 'création + mise à jour' : 'création seule'}`);
  console.log(`  Plage marge : ${reglages.minMargin} % – ${reglages.maxMargin} % (Paramètres)\n`);

  const categories = new Map((await Category.findAll()).map(cat => [cat.name.toLowerCase(), cat]));
  const produits = new Map((await Product.findAll()).map(p => [p.code.toLowerCase(), p]));
  const crees = [];
  const majs = [];
  const ignores = [];
  const erreurs = [];

  for (const { ligne, valeurs } of donnees) {
    const code = String(valeurs.code || '').trim();
    try {
      const nom = String(valeurs.nom || '').trim();
      if (!code) throw new Error('code manquant');
      if (!nom) throw new Error('nom manquant');

      const donneesProduit = {
        code, name: nom,
        ingredient: valeurs.principe_actif || '',
        dosage: valeurs.dosage || '',
        form: valeurs.forme || '',
        presentation: valeurs.presentation || '',
        barcode: valeurs.code_barres ? String(valeurs.code_barres).trim() : null,
        manufacturer: valeurs.laboratoire || '',
        unit: valeurs.unite || 'boîte',
        minStock: entier(valeurs.seuil_min, 5),
        maxStock: valeurs.seuil_max ? entier(valeurs.seuil_max, null) : null,
        storage: valeurs.conservation || '',
        note: '', active: true,
        marginRate: taux(valeurs.taux_marge, 20),
        categoryId: null
      };

      const controle = productSchema.safeParse(donneesProduit);
      if (!controle.success) {
        throw new Error(controle.error.issues.map(i => `${i.path.join('.')} : ${i.message}`).join(' ; '));
      }
      assertMarginRate(controle.data.marginRate, reglages.toJSON());

      const nomCategorie = String(valeurs.categorie || '').trim();
      if (nomCategorie) {
        if (simulation) donneesProduit.categoryId = categories.get(nomCategorie.toLowerCase())?.id ?? null;
        else {
          let categorie = categories.get(nomCategorie.toLowerCase());
          if (!categorie) {
            categorie = await sequelize.transaction(transaction => Category.create({
              name: nomCategorie, description: '', active: true, createdAt: new Date()
            }, { transaction }));
            categories.set(nomCategorie.toLowerCase(), categorie);
            console.log(`  ${c.v}+${c.f} catégorie créée : ${nomCategorie}`);
          }
          donneesProduit.categoryId = categorie.id;
        }
      }

      const existant = produits.get(code.toLowerCase());
      if (existant && !miseAJour) { ignores.push(`${code} (${nom})`); continue; }
      if (existant && miseAJour) {
        const avant = existant.toJSON();
        if (!simulation) {
          await sequelize.transaction(async transaction => {
            await existant.update({ ...controle.data, categoryId: donneesProduit.categoryId ?? existant.categoryId, updatedAt: new Date() }, { transaction });
            await log({ userId: null, action: 'IMPORT', entity: 'PRODUCT', entityId: existant.id,
              before: { code: avant.code, name: avant.name }, after: { code, name: nom, miseAJour: true } }, transaction);
          });
        }
        majs.push(`${code} (${nom})`);
        continue;
      }
      if (simulation) { crees.push(`${code} (${nom})`); continue; }

      const produit = await sequelize.transaction(async transaction => {
        const created = await Product.create({
          ...controle.data, ...donneesProduit,
          cmp: '0.000000', sellingPrice: '0.000000', version: 0,
          createdAt: new Date(), updatedAt: new Date()
        }, { transaction });
        await log({ userId: null, action: 'IMPORT', entity: 'PRODUCT', entityId: created.id,
          after: { code, name: nom, categorie: nomCategorie || null, seuil: donneesProduit.minStock, marge: donneesProduit.marginRate } }, transaction);
        return created;
      });
      produits.set(code.toLowerCase(), produit);
      crees.push(`${code} (${nom})`);
    } catch (erreur) {
      erreurs.push(`ligne ${ligne} — ${code || '(sans code)'} : ${erreur.message}`);
    }
  }

  console.log(`\n${c.g}Résultat${c.f}`);
  console.log(`  ${c.v}✔${c.f} créés      : ${crees.length}`);
  if (miseAJour) console.log(`  ${c.v}✔${c.f} mis à jour : ${majs.length}`);
  console.log(`  ${c.j}ℹ${c.f} ignorés    : ${ignores.length}${ignores.length ? ' (code déjà présent)' : ''}`);
  console.log(`  ${erreurs.length ? c.r : c.j}${erreurs.length ? '✖' : 'ℹ'}${c.f} erreurs    : ${erreurs.length}`);

  if (crees.length) {
    console.log(`\n  Créés :`);
    for (const item of crees.slice(0, 40)) console.log(`   ${c.v}+${c.f} ${item}`);
    if (crees.length > 40) console.log(`   … et ${crees.length - 40} autres.`);
  }
  if (miseAJour && majs.length) {
    console.log(`\n  Mis à jour :`);
    for (const item of majs.slice(0, 40)) console.log(`   ↻ ${item}`);
    if (majs.length > 40) console.log(`   … et ${majs.length - 40} autres.`);
  }
  if (ignores.length) {
    console.log(`\n  Ignorés (relancer avec --update pour les mettre à jour) :`);
    for (const item of ignores.slice(0, 20)) console.log(`   = ${item}`);
    if (ignores.length > 20) console.log(`   … et ${ignores.length - 20} autres.`);
  }
  if (erreurs.length) {
    console.log(`\n  ${c.r}Lignes refusées :${c.f}`);
    for (const item of erreurs) console.log(`   ✖ ${item}`);
    console.log('  (corriger le fichier CSV puis relancer : les lignes déjà créées seront simplement ignorées)');
  }
  if (!simulation && (crees.length || majs.length)) {
    console.log(`\n  Étapes suivantes :`);
    console.log('   1) Catalogue → vérifier quelques fiches (unité, seuil, code-barres)');
    console.log('   2) Réceptions → enregistrer le stock de départ (lots, dates de péremption, prix d’achat)');
    console.log('   3) Ventes → vérifier qu’un prix de vente est bien calculé après la première réception\n');
  }
  void config;
}

main()
  .then(() => close())
  .catch(async error => {
    console.error(`\n${c.r}Échec de l’import : ${error.message}${c.f}\n`);
    await close().catch(() => {});
    process.exit(1);
  });
