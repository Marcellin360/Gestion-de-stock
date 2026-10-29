// ============================================================================
// VERSION UNIQUE DU CODE — 2.7.61.
//   Imprimée dans la bannière de démarrage du backend (server.js) ET servie
//   par la route publique /api/version (sonde du garde-fou « pas de PDF »,
//   2.7.60). Une seule vérité : chaque fanitsiana la fait évoluer, et un coup
//   d'œil sur le terminal de démarrage dit quel code tourne VRAIMENT —
//   « relancer le backend » ne suffit pas si l'ANCIEN processus est encore
//   en écoute sur le port (le nouveau refusera avec EADDRINUSE).
// ============================================================================
export const VERSION_APPLI = '2.7.104';