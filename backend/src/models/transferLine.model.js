// Modèle Sequelize — table « transfer_lines »
import { DataTypes } from 'sequelize';

export const name = 'TransferLine';
export const tableName = 'transfer_lines';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    transferId: {type:DataTypes.INTEGER,allowNull:false},
    productId: {type:DataTypes.INTEGER,allowNull:false},
    fromLotId: {type:DataTypes.INTEGER,allowNull:false},
    toLotId: {type:DataTypes.INTEGER,allowNull:true},
    quantity: {type:DataTypes.INTEGER,allowNull:false},
    unitCost: {type:DataTypes.DECIMAL(20,6),allowNull:false}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"fields": ["transferId"]}]
};
