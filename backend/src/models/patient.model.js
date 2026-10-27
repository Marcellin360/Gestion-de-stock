// Modèle Sequelize — table « patients » (2.7.35, hôpital-pharmacie)
// Patient hospitalisé (pris en charge à l'hôpital) : à la différence du
// client de passage, sa délivrance se justifie par une ORDONNANCE.
import { DataTypes } from 'sequelize';

export const name = 'Patient';
export const tableName = 'patients';

export const attributes = {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(180), allowNull: false },
  service: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
  note: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  // 2.7.79 — MOTIF de l'hospitalisation (ex. « Fièvre ») : la raison de
  // l'entrée du patient, saisie à la fiche et imprimée sur les ordonnances.
  motif: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  // 2.7.36 — date d'admission à l'hôpital (début du « séjour » ; l'ordonnance
  // résumée cumule TOUTES les délivrances de la date et s'y réfère).
  admittedOn: { type: DataTypes.DATEONLY, allowNull: false },
  // 2.7.59 — date DE SORTIE de l'hôpital : gravée automatiquement à la
  // « Sortie du service » (migration 013) et imprimée sur les ordonnances.
  dischargedOn: { type: DataTypes.DATEONLY, allowNull: true },
  // Employé qui a reçu/enregistré le patient (liste des patients : la colonne
  // « Remarque » est remplacée par son nom — demande de l'officine).
  createdBy: { type: DataTypes.INTEGER, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{ fields: ['active', 'name'] }]
};