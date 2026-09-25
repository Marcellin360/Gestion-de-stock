-- ============================================================================
-- PharmaStock — Migration 002 : données de référence indispensables
-- Rôles et permissions (RG18), paramètres par défaut (RG22), unités et formes.
-- ============================================================================
-- Trois rôles, trois métiers :
--   ADMIN      : tout, y compris les comptes, les réglages et l'audit ;
--   PHARMACIST : la pharmacie (ventes, stocks du comptoir, prix, rapports) ;
--   DEPOT      : la réserve — réceptions, transferts vers la pharmacie, pertes.
-- Il n'y a ni « gestionnaire de stock » ni « vendeur » séparés : le dépôt est un
-- utilisateur à part entière, la pharmacie vend (le pharmacien ou l'administrateur).
INSERT INTO roles (code, name, permissions) VALUES
 ('ADMIN','Administrateur','["reference","receipt","transfer","sale","loss","inventory","prices","costs","settings","users","audit","reports","cancel","documents"]'),
 ('PHARMACIST','Pharmacien / responsable','["reference","transfer","sale","loss","inventory","prices","costs","audit","reports","cancel","documents"]'),
 ('DEPOT','Gestionnaire du dépôt','["reference","receipt","transfer","loss","inventory","costs","reports","documents"]')
ON CONFLICT (code) DO NOTHING;

INSERT INTO settings (id, pharmacy_name, currency, valuation, margin_mode, min_margin, max_margin, expiry_days)
VALUES (1, 'Ma pharmacie', 'Ar', 'LOT', 'COST', 10, 30, 90)
ON CONFLICT (id) DO NOTHING;

-- Référentiel des formes galéniques (aide à la saisie, modifiable)
CREATE TABLE IF NOT EXISTS product_forms (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE
);
INSERT INTO product_forms (name) VALUES
 ('Comprimé'),('Comprimé effervescent'),('Gélule'),('Sirop'),('Suspension'),('Solution injectable'),
 ('Pommade'),('Crème'),('Gel'),('Collyre'),('Suppositoire'),('Ovule'),('Poudre'),('Sachet'),('Spray'),
 ('Matériel médical'),('Autre')
ON CONFLICT (name) DO NOTHING;

-- Unités de gestion autorisées en V1 (vente à l'unité de gestion uniquement)
CREATE TABLE IF NOT EXISTS units_of_measure (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE
);
INSERT INTO units_of_measure (name) VALUES
 ('boîte'),('flacon'),('tube'),('sachet'),('ampoule'),('unité'),('pot'),('caisse')
ON CONFLICT (name) DO NOTHING;
