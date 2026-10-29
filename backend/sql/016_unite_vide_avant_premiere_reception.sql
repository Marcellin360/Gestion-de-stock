-- ============================================================================
-- 016 — 2.7.90 : UNITÉ VIDE tant qu'aucune réception n'a eu lieu
--
-- Demande du dépôt : un médicament fraîchement créé au Catalogue apparaît au
-- Stock à 0 (normal — rien de reçu encore) mais NE DOIT PAS afficher d'unité :
-- la colonne « Unité » reste VIDE. C'est la PREMIÈRE réception qui la fixe,
-- l'unité saisie à la réception se reportant automatiquement sur la fiche.
--
-- Avant cette version, le validateur posait « boîte » par défaut à la
-- création. Cette remise à zéro ne touche QUE les fiches JAMAIS réceptionnées
-- — ni lot ni mouvement : elles repartent à '' et leur première réception
-- fixera l'unité. Toute fiche ayant DÉJÀ du stock ou des mouvements garde son
-- unité, inchangée.
--
-- Données seulement : AUCUN changement de schéma (la colonne products.unit,
-- NOT NULL, accepte déjà la chaîne vide). Rejouable sans effet (unit <> '').
-- ⚠ Après recopie du code : npm run db:migrate
-- ============================================================================
UPDATE products
   SET unit = ''
 WHERE unit <> ''
   AND NOT EXISTS (SELECT 1 FROM lots      l WHERE l.product_id = products.id)
   AND NOT EXISTS (SELECT 1 FROM movements m WHERE m.product_id = products.id);