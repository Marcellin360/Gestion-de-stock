#!/usr/bin/env node
// ============================================================================
// Diagnostic des PRIX DE VENTE — version 2 (valorisation LOT ou CMP).
//
// POURQUOI CE SCRIPT
// Le catalogue affiche côte à côte le CMP (coût moyen pondéré) et le prix de
// vente. Ces deux nombres ne sortent PAS de la même base de calcul :
//
//   • valorisation CMP  : prix = CMP × (1 + taux/100)  → le prix « suit » la colonne CMP ;
//   • valorisation LOT  : prix = coût de revient du DERNIER LOT REÇU × (1 + taux/100)
//                         → le prix ne suit PAS la colonne CMP (qui est une moyenne
//                           de tout l'historique des réceptions, jamais réduite par
//                           les ventes). Deux nombres justes mais de bases différentes.
//
// Le vrai risque n'est pas le CMP : c'est le lot qui va SORTIR (FEFO = péremption la
// plus proche). Si son coût de revient dépasse le prix de vente, chaque unité vendue
// perd de l'argent. Ce script le dit produit par produit, magasin par magasin.
//
//   Emploi (depuis la racine du projet) :
//       node backend/scripts/verifier-prix.mjs
//       node backend/scripts/verifier-prix.mjs --detail      (détail de tous les lots en alerte)
//
// Lecture du résultat :
//   • « ok (dernier lot) »    → le prix correspond au coût du dernier lot reçu : normal.
//   • « À REVOIR »            → aucun calcul ne correspond : relancer une migration ou
//                               corriger le taux depuis le catalogue (icône %).
//   • « PERTE POSSIBLE »      → le prochain lot vendu coûte plus cher que le prix :
//                               corriger le taux (icône %) ou annuler/recevoir la bonne
//                               commande, sinon la vente se fera à perte.
// ============================================================================
import { pathToFileURL } from 'node:url';
import { Product, Lot } from '../src/models/index.js';
import { close } from '../src/config/database.js';
import { getSettings } from '../src/services/settings.service.js';
import { pickLots } from '../src/services/stock.service.js';
import { D, money, display } from '../src/utils/money.js';
import { LOT_PICKING, VALUATION } from '../src/config/constants.js';
import { today } from '../src/utils/dates.js';

const fr = value => Number(display(value, 2)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const court = (texte, taille) => String(texte ?? '').slice(0, taille).padEnd(taille);

/** Prix de vente à partir d'un coût — même formule que services/pricing.service.js. */
export const prixDepuisCout = (cout, taux, mode) => (mode === 'SALE'
  ? money(D(cout).div(D(1).sub(D(taux).div(100))))
  : money(D(cout).mul(D(1).add(D(taux).div(100)))));

/**
 * Analyse pure (aucune base de données) : pour chaque médicament, quel coût a servi
 * au calcul du prix, et quel lot va réellement sortir du magasin.
 */
export function analyser(produits, lots, settings, date) {
  return produits.map(produit => {
    const lotsProduit = lots.filter(lot => Number(lot.productId) === Number(produit.id));
    const dernierLot = lotsProduit.slice().sort((a, b) => b.id - a.id)[0] || null;
    const coutLOT = D(dernierLot ? dernierLot.unitCost : 0);
    const coutCMP = D(produit.cmp);
    const prixRemise = money(produit.sellingPrice);
    const attenduLOT = prixDepuisCout(coutLOT, produit.marginRate, settings.marginMode);
    const attenduCMP = prixDepuisCout(coutCMP, produit.marginRate, settings.marginMode);

    const prochains = {};
    for (const magasin of ['PHARMACY', 'DEPOT']) {
      const dispo = lotsProduit.filter(lot => lot.location === magasin);
      const { picked } = pickLots(dispo, 1, {
        date, method: LOT_PICKING.FEFO, allowExpired: Boolean(settings.allowExpiredSale)
      });
      const suivant = picked[0] ? picked[0].lot : null;
      prochains[magasin] = suivant
        ? { lot: suivant, marge: D(prixRemise).sub(D(suivant.unitCost)), perte: D(prixRemise).sub(D(suivant.unitCost)).lt(0) }
        : null;
    }

    const coherentLOT = D(attenduLOT).sub(prixRemise).abs().lte('0.000001');
    const coherentCMP = D(attenduCMP).sub(prixRemise).abs().lte('0.000001');
    return { produit, dernierLot, lotsProduit, coutLOT, coutCMP, prixRemise, attenduLOT, attenduCMP, coherentLOT, coherentCMP, prochains };
  });
}

async function main() {
  const detail = process.argv.includes('--detail');
  const settings = (await getSettings()).toJSON();
  const date = today();
  const produits = (await Product.findAll({ order: [['name', 'ASC']] })).map(p => p.toJSON());
  const lots = (await Lot.findAll({ order: [['expiresOn', 'ASC NULLS LAST'], ['id', 'ASC']] })).map(l => l.toJSON());
  const lignes = analyser(produits, lots, settings, date);

  console.log('Paramètres');
  console.log(`  • Valorisation du stock : ${settings.valuation}`
    + ` (${settings.valuation === VALUATION.CMP ? 'coût moyen pondéré — le prix suit la colonne CMP' : 'coût de revient du lot — le prix vient du DERNIER LOT REÇU'})`);
  console.log(`  • Mode de marge         : ${settings.marginMode}`
    + ` (${settings.marginMode === 'SALE' ? 'prix = coût ÷ (1 − taux/100)' : 'prix = coût × (1 + taux/100)'})`);
  console.log(`  • Plage autorisée       : ${settings.minMargin} % – ${settings.maxMargin} %`);
  console.log('');

  console.log('Code     | Médicament                        | CMP affiché  | Coût dernier lot | Taux  | Prix enregistré | Prix attendu (dernier lot) | Prix attendu (CMP) | Verdict');
  console.log('---------+-----------------------------------+--------------+------------------+-------+-----------------+----------------------------+--------------------+----------------------');
  for (const ligne of lignes) {
    const verdict = ligne.coherentLOT && settings.valuation === VALUATION.LOT ? 'ok (dernier lot)'
      : ligne.coherentCMP && settings.valuation === VALUATION.CMP ? 'ok (CMP)'
        : ligne.coherentLOT ? 'ok (dernier lot)'
          : ligne.coherentCMP ? 'ok (CMP)' : 'À REVOIR';
    console.log(
      `${court(ligne.produit.code, 8)} | ${court(ligne.produit.name, 33)} | ${fr(ligne.coutCMP).padStart(12)} | ${fr(ligne.coutLOT).padStart(16)} | `
      + `${String(Number(ligne.produit.marginRate)).padStart(4)}% | ${fr(ligne.prixRemise).padStart(15)} | ${fr(ligne.attenduLOT).padStart(26)} | ${fr(ligne.attenduCMP).padStart(18)} | ${verdict}`
    );
  }

  console.log('');
  console.log('Prochain lot à sortir (FEFO = péremption la plus proche) et marge unitaire réelle');
  const alertes = [];
  for (const ligne of lignes) {
    const ecarts = ['PHARMACY', 'DEPOT'].map(magasin => {
      const suivant = ligne.prochains[magasin];
      if (!suivant) return `    ${magasin.padEnd(8)} : aucun lot disponible`;
      const mot = suivant.perte ? 'PERTE POSSIBLE' : 'ok';
      const texte = `    ${magasin.padEnd(8)} : lot ${court(suivant.lot.number, 18)} péremption ${String(suivant.lot.expiresOn).slice(0, 10)}`
        + ` · qté ${String(suivant.lot.quantity).padStart(5)} · coût ${fr(suivant.lot.unitCost).padStart(12)}`
        + ` · prix ${fr(ligne.prixRemise).padStart(12)} → marge unitaire ${fr(suivant.marge).padStart(12)} → ${mot}`;
      if (suivant.perte) alertes.push({ ligne, magasin, suivant });
      return texte;
    });
    if (ecarts.some(t => t.includes('PERTE POSSIBLE')) || detail) {
      console.log(`${ligne.produit.code} — ${ligne.produit.name}`);
      ecarts.forEach(t => console.log(t));
      if (detail) {
        for (const lot of ligne.lotsProduit.sort((a, b) => String(a.expiresOn).localeCompare(String(b.expiresOn)))) {
          console.log(`      lot ${court(lot.number, 18)} ${lot.location.padEnd(8)} qté ${String(lot.quantity).padStart(5)}`
            + ` reçu ${String(lot.receivedOn).slice(0, 10)} péremption ${String(lot.expiresOn).slice(0, 10)} coût ${fr(lot.unitCost).padStart(12)} (reçu initial : ${lot.receivedQuantity})`);
        }
      }
    }
  }

  const incoherents = lignes.filter(l => !l.coherentLOT && !l.coherentCMP);
  console.log('');
  if (incoherents.length === 0) {
    console.log('MAHAFAKATRA : ny prix de vente rehetra dia mifanaraka amin\'ny coût sy ny taux (tsy misy prix diso kajy).');
    if (settings.valuation === VALUATION.LOT) {
      console.log('Noho ny valorisation LOT, ny prix dia mifototra amin\'ny coût ny LOT FARANY NIDITRA — fa tsy ny CMP aseho');
      console.log('eo amin\'ny Catalogue. Izany no mahatonga azy ireo tsy mitovy : samy marina avokoa izy roa.');
    }
  } else {
    console.log(`TSY MAHAFAKATRA : ${incoherents.length} médicament(s) manana prix tsy mifanaraka amin'ny coût × taux :`);
    incoherents.forEach(l => console.log(`   • ${l.produit.code} ${l.produit.name}`));
    console.log('Ovay ny taux eny amin\'ny Catalogue (ikona %) : ny serveur hamerina ny prix marina.');
  }

  if (alertes.length === 0) {
    console.log('TSY MISY atahorana : ny prix dia mihoatra ny coût ny lot rehetra mbola ao an-tokotany (tsy misy vente à perte).');
  } else {
    console.log(`⚠ ${alertes.length} alerte(s) — ny lot hivoaka manaraka dia LAHO noho ny prix de vente :`);
    for (const { ligne, magasin, suivant } of alertes) {
      console.log(`   • ${ligne.produit.code} ${ligne.produit.name} — ${magasin}, lot ${suivant.lot.number}`
        + ` coût ${fr(suivant.lot.unitCost)} vs prix ${fr(ligne.prixRemise)} → fatiantoka ${fr(D(suivant.marge).abs())} isaky ny unité.`);
    }
    console.log('Ataovy : ovay ny taux amin\'ny Catalogue (ikona %), na amboary ny réception (annulation + réception vaovao).');
  }
  console.log('');
  console.log('Raha « 0 Ar » no hita eo amin\'ny efijery : ny PROFIL ampiasaina (dépôt) no tsy mahazo ny prix');
  console.log('de vente — tsy diso kajy izany. Ampiasao ny script autoriser-prix-depot.mjs raha tianao hiseho.');
}

/* node backend/scripts/verifier-prix.mjs  (n'exécute rien si le fichier est importé) */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(close)
    .catch(async error => {
      console.error('Échec :', error.message);
      await close();
      process.exitCode = 1;
    });
}