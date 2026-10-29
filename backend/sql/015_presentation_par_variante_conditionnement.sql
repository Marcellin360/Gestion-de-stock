-- ============================================================================
-- 015 — 2.7.84 : PRÉSENTATION PAR FICHE + CONDITIONNEMENT GÉNÉRALISÉ
--
-- Deux demandes liées (dépôt + comptoir) :
--
--  1) PRÉSENTATION : un même médicament existe en plusieurs présentations
--     commerciales (« Alcool médical — Flacon 100 ml », « Flacon 250 ml »,
--     « Flacon 500 ml ») qui ne se mélangent JAMAIS dans le stock : prix
--     d'achat, CMP, prix de vente et quantités sont propres à chaque
--     présentation. La colonne `presentation` existe déjà ; la nouveauté est
--     dans le LOGICIEL : le formulaire de réception sépare désormais le NOM
--     DE BASE et la PRÉSENTATION, et CRÉE automatiquement la fiche quand le
--     couple (nom + présentation) est nouveau.
--
--  2) CONDITIONNEMENT (la chaîne « 1 carton = N boîtes, 1 boîte = N
--     plaquettes, 1 plaquette = N comprimés », « 1 flacon = 250 ml »,
--     « 1 rouleau = 500 cm »…) : ces nombres NE SONT PAS FIXES — ils sont
--     saisis à la réception et MÉMORISÉS sur la fiche, puis re-proposés.
--
-- Ce qui change en base :
--   • products.packaging : chaîne de conditionnement au format JSON compact
--     [["carton","boîte",100],["boîte","plaquette",10],["plaquette","comprimé",10]]
--     ('' = comportement historique 2.7.12 : blisters_per_box/units_per_blister) ;
--   • products.purchase_unit : unité d'ACHAT habituelle (proposée à la
--     réception, ex. « carton ») ;
--   • sale_lines.sale_unit : n'accepte plus SEULEMENT BOX/BLISTER/UNIT —
--     n'importe quelle unité de la chaîne (« ml », « cm », « plaquette »…) ;
--     les anciennes lignes gardent leurs codes historiques, lus tel quels.
--
-- Rejouable (IF NOT EXISTS / DROP IF EXISTS). ⚠ Après recopie : npm run db:migrate
-- ============================================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS packaging     TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS purchase_unit VARCHAR(40) NOT NULL DEFAULT '';

-- Les fiches déjà réglées pour la vente au détail (2.7.12) gagnent la chaîne
-- équivalente : « unité de gestion → plaquette → comprimé ». Inchangeables
-- ensuite : la réception mémorise le nouveau réglage au prochain bon.
UPDATE products
   SET packaging = '[["' || unit || '","plaquette",' || blisters_per_box
                || '],["plaquette","comprimé",' || units_per_blister || ']]'
 WHERE packaging = ''
   AND blisters_per_box > 0
   AND units_per_blister > 0;

-- Les fiches dont le détail n'était pas réglé (0) restent SANS chaîne : elles
-- se vendent uniquement dans leur unité de gestion, comme avant.

-- ── sale_lines : unités de vente LIBRES (l'unité doit juste exister dans la
--    chaîne du produit — c'est le serveur qui vérifie, fiche par fiche). ────
ALTER TABLE sale_lines DROP CONSTRAINT IF EXISTS sale_lines_sale_unit_check;
ALTER TABLE sale_lines
  ADD CONSTRAINT sale_lines_sale_unit_len CHECK (char_length(sale_unit) BETWEEN 1 AND 40);

COMMENT ON COLUMN products.packaging IS
  'Chaîne de conditionnement JSON : [[conteneur,contenu,nombre],…] — mémorisée à la réception (2.7.84)';
COMMENT ON COLUMN products.purchase_unit IS
  'Unité d''achat habituelle, re-proposée au dépôt à la réception (2.7.84)';