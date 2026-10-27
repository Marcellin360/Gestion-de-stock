// ============================================================================
// 2.7.36 — Périodes de garde (TDR par DATES) d'un employé de l'hôpital :
// chaque ligne = UNE période « du start_on AU end_on » (jours compris). Un
// employé peut avoir plusieurs périodes (elles peuvent même se chevaucher) ;
// elles répondent à la demande « un ou plusieurs date et jour de garde ».
// L'ancien duty_day (jour de semaine) reste possible en plus (repetition
// hebdomadaire simple) : les deux comptent dans le tableau de garde.
// ============================================================================
import { DataTypes } from 'sequelize';

export const name = 'StaffDuty';
export const tableName = 'staff_duties';

export const attributes = {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  staffId: { type: DataTypes.INTEGER, allowNull: false },
  startOn: { type: DataTypes.DATEONLY, allowNull: false }, // inclus
  endOn: { type: DataTypes.DATEONLY, allowNull: false },   // inclus
  note: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
  createdBy: { type: DataTypes.INTEGER, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{ fields: ['staff_id', 'start_on', 'end_on'] }]
};