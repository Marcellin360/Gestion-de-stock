// Modèle Sequelize — table « medical_staff » (2.7.35, hôpital-pharmacie)
// Personnel soignant qui amène le carnet : médecin ou sage-femme.
// 2.7.38 — la garde est une PÉRIODE DE DATES OBLIGATOIRE portée par la fiche :
// « duty_start_on » (début) → « duty_end_on » (fin). L'ancien « jour de
// semaine (duty_day) » n'existe plus côté application.
import { DataTypes } from 'sequelize';

export const name = 'MedicalStaff';
export const tableName = 'medical_staff';

export const attributes = {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  role: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'DOCTOR' },
  dutyStartOn: { type: DataTypes.DATEONLY, allowNull: true },
  dutyEndOn: { type: DataTypes.DATEONLY, allowNull: true },
  phone: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '' },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{ fields: ['active', 'dutyStartOn'] }]
};