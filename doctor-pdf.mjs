#!/usr/bin/env node
// ============================================================================
// doctor-pdf.mjs — 2.7.61 « trouve et neutralise l'ANCIEN backend »
// ----------------------------------------------------------------------------
// L'erreur « le backend qui RÉPOND est un ANCIEN code (il ne connaît même pas
// /api/version) » signifie : un processus plus ancien écoute ENCORE sur le
// port, et redémarrer NE SUFFIT PAS s'il n'est pas arrêté (le nouveau backend
// ne peut pas prendre la place : EADDRINUSE, ou vous avez relancé ailleurs).
//
// Ce script, SANS RIEN INSTALLER (zéro dépendance) :
//   1. sonde les ports usuels : /api/health (un backend vit-il ?) puis
//      /api/version (code récent ou ANCIEN ?) ;
//   2. liste, pour chaque port occupé par un ANCIEN code, le PID du processus
//      coupable (netstat sous Windows, lsof/fuser ailleurs) ;
//   3. avec l'option  --vono  (ou --fix), LES TUE proprement.
//
//   % node doctor-pdf.mjs            → diagnostic (ne touche à rien)
//   % node doctor-pdf.mjs --vono     → diagnostic + ARRÊT des anciens backend
//
// À FAIRE ENSUITE, toujours :  cd backend && npm start
//   et VÉRIFIER la bannière : « code 2.7.61 » (ou plus récent) + le dossier.
// ============================================================================
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = dirname(fileURLToPath(import.meta.url));
const TUER = process.argv.includes('--vono') || process.argv.includes('--fix');
const WINDOWS = process.platform === 'win32';

// --- Ports candidats : celui du .env en premier, puis les classiques. -------
function portDuEnv() {
  try {
    const env = readFileSync(join(RACINE, '.env'), 'utf8');
    const ligne = env.split(/\r?\n/).find(l => /^\s*PORT\s*=\s*\d+/.test(l));
    return ligne ? Number(ligne.split('=')[1]) : null;
  } catch { return null; }
}
const PORTS = [...new Set([portDuEnv(), 3001, 3000, 4000, 5000, 8000, 8080].filter(Boolean))];

async function sonde(url, timeoutMs = 900) {
  const pistolet = new AbortController();
  const pendo = setTimeout(() => pistolet.abort(), timeoutMs);
  try {
    const reponse = await fetch(url, { signal: pistolet.signal, redirect: 'follow' });
    const brut = await reponse.text().catch(() => '');
    let json = null;
    try { json = JSON.parse(brut); } catch { /* HTML ou vide */ }
    return { status: reponse.status, json };
  } catch { return null; }
  finally { clearTimeout(pendo); }
}

// --- PID(s) écoutant sur un port (multi-plateforme). -------------------------
function pidsSurPort(port) {
  try {
    if (WINDOWS) {
      const net = execSync('netstat -ano -p tcp', { encoding: 'utf8', windowsHide: true });
      return [...new Set(net.split(/\r?\n/)
        .filter(l => l.includes(`:${port}`) && /ECOUTE|LISTENING/i.test(l))
        .map(l => Number(l.trim().split(/\s+/).pop()))
        .filter(Number.isFinite))];
    }
    try {
      return execFileSync('lsof', ['-nP', `-tiTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
        .split(/\s+/).map(Number).filter(Number.isFinite);
    } catch {
      try {
        return execSync(`fuser ${port}/tcp 2>/dev/null`, { encoding: 'utf8' })
          .split(/\s+/).map(Number).filter(Number.isFinite);
      } catch {
        // Dernier recours : ss, ligne « … :PORT … users:(("node",pid=123,fd=… ».
        const ss = execSync('ss -ltnp 2>/dev/null', { encoding: 'utf8' });
        return [...new Set(ss.split(/\r?\n/)
          .filter(l => l.includes(`:${port}`))
          .flatMap(l => [...l.matchAll(/pid=(\d+)/g)].map(m => Number(m[1]))))];
      }
    }
  } catch { return []; }
}

function tue(pid) {
  try {
    if (WINDOWS) execFileSync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true });
    else process.kill(pid, 'SIGTERM');
    return true;
  } catch { return false; }
}

const moi = process.pid;
let anciens = 0;
let arrets = 0;

console.log('========================================================================');
console.log('  doctor-pdf — quel backend répond VRAIMENT ?');
console.log(`  (candidats : ${PORTS.join(', ')})`);
console.log('========================================================================');

for (const port of PORTS) {
  const sante = await sonde(`http://127.0.0.1:${port}/api/health`);
  if (!sante || sante.status >= 500) {
    console.log(`— port ${port} : personne ne répond (silence).`);
    continue;
  }
  // Un backend vit ici : sa version ?
  const version = await sonde(`http://127.0.0.1:${port}/api/version`);
  if (version?.json?.versionAppli) {
    console.log(`✅ port ${port} : backend à jour — code ${version.json.versionAppli}. Rien à faire ici.`);
    continue;
  }
  anciens++;
  console.log(`⚠  port ${port} : ANCIEN backend en écoute (ne connaît pas /api/version). C'est LUI qui dit « pas de PDF ».`);
  const pids = pidsSurPort(port).filter(p => p !== moi);
  if (!pids.length) {
    console.log(`   PID introuvable automatiquement : arrêtez tout processus « node » manuellement`);
    console.log(WINDOWS
      ? '   (Gestionnaire des tâches → Processus → Node.js → Fin de tâche).'
      : '   (tapez : pkill -f « node.*server » ou pkill node).');
    continue;
  }
  for (const pid of pids) {
    if (!TUER) {
      console.log(`   PID coupable : ${pid}  —  relancez avec  --vono  pour l'arrêter, ou tuez-le à la main${WINDOWS ? ' (taskkill /F /PID ' + pid + ')' : ' (kill ' + pid + ')'}.`);
    } else {
      const ok = tue(pid);
      if (ok) arrets++;
      console.log(`   ${ok ? '🗡  arrêté' : '❌ IMPOSSIBLE d\'arrêter'} : PID ${pid}.`);
    }
  }
}

console.log('---------------------------- ENSUITE -------------------------------------');
const restent = anciens - arrets;
if (anciens && TUER && !restent) {
  console.log(`✅ ${arrets} ancien(s) backend arrêté(s). Démarrez maintenant LE BON :`);
} else if (anciens && TUER) {
  console.log(`⚠  ${restent} ancien(s) backend N'ONT PAS pu être arrêtés automatiquement`);
  console.log('   — tuez les PID affichés ci-dessus À LA MAIN, puis démarrez LE BON :');
} else if (anciens) {
  console.log(`⚠  ${anciens} ancien(s) backend tourne(nt) encore. Deux choix :`);
  console.log('     · relancez ce script avec  node doctor-pdf.mjs --vono');
  console.log('     · ou tuez-les à la main (commandes affichées ci-dessus),');
  console.log('   puis démarrez LE BON backend :');
} else {
  console.log('✅ Aucun ancien backend ne traîne. Vérifiez juste le démarrage :');
}
console.log('     cd backend');
console.log('     npm start');
console.log("   Au DÉMARRAGE, la bannière doit afficher : « code 2.7.61 » (ou plus récent)");
console.log('   + le dossier du projet + son PID. Si ce n\u2019est pas le cas : vous êtes');
console.log('   dans un autre dossier que celui où vous avez collé le code.');
if (existsSync(join(RACINE, 'backend', 'sql', '013_patients_date_sortie.sql'))) {
  console.log('   Pensez aussi : npm run db:migrate  (colonne date de sortie, 2.7.59).');
}
// Exit 1 tant qu'un ANCIEN backend reste en écoute (signal « action manquée »),
// 0 quand tout est propre ou vient d'être arrêté.
process.exit(restent ? 1 : 0);