// Modèle Sequelize — table « transfer_corrections » (2.7.79)
// Demande de correction d'un transfert : proposée par le dépôt, tranchée
// par un administrateur. Le transfert ne change qu'à la validation.
// (Même architecture que « receipt_corrections », teboka ③ — 2.7.34.)
import { DataTypes } from 'sequelize';

export const name = 'TransferCorrection';
export const tableName = 'transfer_corrections';

export const attributes = {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  reference: { type: DataTypes.STRING(40), allowNull: false },
  transferId: { type: DataTypes.INTEGER, allowNull: false },
  proposedBy: { type: DataTypes.INTEGER, allowNull: false },
  payload: { type: DataTypes.JSONB, allowNull: false },
  reason: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'PENDING' },
  decidedBy: { type: DataTypes.INTEGER, allowNull: true },
  decisionNote: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  decidedAt: { type: DataTypes.DATE, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{ fields: ['transferId'] }, { fields: ['status'] }]
};