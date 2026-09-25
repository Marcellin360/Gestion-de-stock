// Modèle Sequelize — table « adjustment_lines » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'AdjustmentLine';
export const tableName = 'adjustment_lines';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    adjustmentId: {type:DataTypes.INTEGER,allowNull:false},
    productId: {type:DataTypes.INTEGER,allowNull:false},
    lotId: {type:DataTypes.INTEGER,allowNull:false},
    quantity: {type:DataTypes.INTEGER,allowNull:false},
    unitCost: {type:DataTypes.DECIMAL(20,6),allowNull:false},
    gapReason: {type:DataTypes.TEXT,allowNull:false,defaultValue:''}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: []
};
