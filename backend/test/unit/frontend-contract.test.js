// ============================================================================
// Contrat entre l'interface et l'API (test de garde).
//
// But : empêcher la réapparition d'une erreur vécue en vrai au comptoir —
// l'écran de vente envoyait `quantite` alors que le serveur attend `quantity`
// (« Unrecognized key(s) in object: 'quantite' »). Comme le serveur refuse
// strictement tout champ non déclaré, chaque nom de champ utilisé par
// l'interface DOIT être écrit tel quel.
//
// Ce test lit les sources du frontend : aucun serveur, aucune base nécessaire.
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const sourceFront = join(racine, 'frontend', 'src');

/** Liste récursive des fichiers sources du frontend. */
function fichiers(dossier) {
  const trouves = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiers(chemin));
    else if (/\.(jsx|js)$/.test(entree)) trouves.push(chemin);
  }
  return trouves;
}

const sources = fichiers(sourceFront).map(chemin => ({ chemin, texte: readFileSync(chemin, 'utf8') }));

test('contrat API : les champs envoyés par l’interface portent le nom exact du serveur', () => {
  // Noms acceptés par les schémas zod (backend/src/validators/*).
  const interdits = [
    ['quantite', 'quantity'],           // le cas réellement rencontré à la vente
    ['quantity_lot', 'quantity'],
    ['prixUnitaire', 'unitPrice'],
    ['prix_achat', 'purchasePrice'],
    ['numeroLot', 'number'],
    ['dateExpiration', 'expiresOn'],
    ['dateReception', 'receivedOn'],
    ['motifPerte', 'reason']
  ];
  const fautes = [];
  for (const { chemin, texte } of sources) {
    for (const [mauvais, bon] of interdits) {
      // On cherche un usage en tant que clé d'objet (« quantite: ») ou un accès
      // de champ (« ligne.quantite »), pas une simple phrase en français.
      const motif = new RegExp(`(^|[^\\w.])(${mauvais})\\s*:|\\.${mauvais}\\b`, 'm');
      if (motif.test(texte)) fautes.push(`${chemin.replace(racine, '')} → « ${mauvais} » (attendu « ${bon} »)`);
    }
  }
  assert.deepEqual(fautes, [], `Champ(s) hors contrat API :\n${fautes.join('\n')}`);
});

test('contrat API : l’écran de vente construit son panier avec « productId » et « quantity »', () => {
  const vente = sources.find(({ chemin }) => chemin.endsWith(join('pages', 'SalesPage.jsx')));
  assert.ok(vente, 'SalesPage.jsx doit exister');
  assert.match(vente.texte, /productId:\s*Number\(/, 'la ligne de vente doit convertir productId en nombre');
  assert.match(vente.texte, /quantity:\s*Number\(/, 'la ligne de vente doit envoyer « quantity » (nombre)');
  assert.match(vente.texte, /lines:\s*lignesEnvoyees\(\)/,
    'les deux appels (/sales/quote et /sales) doivent passer par lignesEnvoyees()');
});

test('contrat API : les formulaires de réception, transfert et perte envoient les bons champs', () => {
  const attendus = {
    [join('forms', 'ReceiptForm.jsx')]: ['productId', 'number', 'quantity', 'purchasePrice', 'receivedOn', 'expiresOn', 'manufacturedOn'],
    [join('forms', 'TransferForm.jsx')]: ['lotId', 'quantity'],
    [join('forms', 'LossForm.jsx')]: ['lotId', 'quantity']
  };
  for (const [partie, champs] of Object.entries(attendus)) {
    const fichier = sources.find(({ chemin }) => chemin.endsWith(partie));
    assert.ok(fichier, `${partie} doit exister`);
    for (const champ of champs) {
      assert.match(fichier.texte, new RegExp(`${champ}\\s*:`), `${partie} : le champ « ${champ} » doit être envoyé`);
    }
  }
});

test('validation : un champ mal orthographié reçoit un message français avec le nom attendu', async () => {
  const { traduireIssues } = await import('../../src/middlewares/zodMessages.js');
  const { z } = await import('zod');
  const schema = z.object({
    lines: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive() }).strict()).min(1)
  }).strict();
  const resultat = schema.safeParse({ lines: [{ productId: 3, quantite: 5 }] });
  assert.equal(resultat.success, false);
  const { details } = traduireIssues(resultat.error.issues);
  const texte = details.join(' | ');
  assert.match(texte, /quantity/, 'le message doit rappeler le nom de champ attendu');
  assert.match(texte, /quantité/, 'le message doit donner le libellé métier');
  assert.match(texte, /obligatoire|champ manquant/, 'le champ manquant doit être signalé');
  assert.doesNotMatch(texte, /Unrecognized key/, 'le message technique anglais doit avoir disparu');
});