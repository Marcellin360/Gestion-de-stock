// ============================================================================
// Constantes métier partagées (rôles, magasins, types de documents, motifs)
// ============================================================================

/** Rôles applicatifs (table roles, RG18). */
export const ROLE_CODES = ['ADMIN', 'PHARMACIST', 'DEPOT'];

export const ROLE_LABELS = {
  ADMIN: 'Administrateur',
  PHARMACIST: 'Pharmacien / responsable',
  DEPOT: 'Dépôt / magasin'
};

/**
 * Les deux magasins de l'officine.
 *  - DEPOT    : la réserve. Toute marchandise reçue y entre en premier.
 *  - PHARMACY : l'officine, seule à vendre au comptoir.
 * Le stock du dépôt et celui de la pharmacie sont suivis séparément ; la
 * marchandise passe de l'un à l'autre par un TRANSFERT.
 */
export const LOCATIONS = ['DEPOT', 'PHARMACY'];

export const LOCATION_LABELS = {
  DEPOT: 'Dépôt',
  PHARMACY: 'Pharmacie'
};

/** Types de documents porteurs de mouvements de stock. */
export const DOCUMENT_TYPES = ['RECEIPT', 'TRANSFER', 'SALE', 'LOSS', 'ADJUSTMENT'];

export const DOCUMENT_LABELS = {
  RECEIPT: 'Réception (dépôt)',
  TRANSFER: 'Transfert dépôt → pharmacie',
  SALE: 'Vente (pharmacie)',
  LOSS: 'Perte / don',
  ADJUSTMENT: 'Ajustement d’inventaire',
  CANCEL: 'Annulation'
};

export const DOCUMENT_TABLES = {
  RECEIPT: { model: 'Receipt', label: 'Réception', sign: 1 },
  TRANSFER: { model: 'Transfer', label: 'Transfert', sign: 0 },
  SALE: { model: 'Sale', label: 'Vente', sign: -1 },
  LOSS: { model: 'Loss', label: 'Perte / don', sign: -1 },
  ADJUSTMENT: { model: 'Adjustment', label: 'Ajustement d’inventaire', sign: 0 }
};

/** Motifs de transfert dépôt → pharmacie (aide à la saisie). */
export const TRANSFER_REASONS = [
  'Réassort du comptoir',
  'Demande du pharmacien',
  'Produit très demandé',
  'Ouverture d’un second rayon',
  'Retour du surplus au dépôt'
];

/** Motifs obligatoires des sorties non commerciales (RG07). */
export const LOSS_REASONS = ['Casse', 'Détérioration', 'Expiration', 'Perte', 'Don', 'Rappel'];

export const STATUS = {
  VALIDATED: 'VALIDATED',
  CANCELLED: 'CANCELLED',
  RECEIVED: 'RECEIVED',
  DRAFT: 'DRAFT',
  ABANDONED: 'ABANDONED',
  AVAILABLE: 'AVAILABLE',
  BLOCKED: 'BLOCKED'
};

/** Modes de calcul du prix de vente (RG13, RG21). */
export const MARGIN_MODES = { COST: 'COST', SALE: 'SALE' };
/** Méthodes de valorisation du stock (§9.7). */
export const VALUATION = { LOT: 'LOT', CMP: 'CMP' };
/** Méthodes de sortie des lots (§9.8) — FEFO est la méthode opérationnelle. */
export const LOT_PICKING = { FEFO: 'FEFO', FIFO: 'FIFO', LIFO: 'LIFO' };

export const CURRENCY = 'Ar';

/** Niveau d'alerte « expiration proche » par défaut (jours) — modifiable dans Paramètres. */
export const SEVERITY = { RED: 'red', AMBER: 'amber' };
