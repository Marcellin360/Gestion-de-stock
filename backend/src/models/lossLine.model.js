// Modèle Sequelize — table « loss_lines » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'LossLine';
export const tableName = 'loss_lines';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    lossId: {type:DataTypes.INTEGER,allowNull:false},
    productId: {type:DataTypes.INTEGER,allowNull:false},
    lotId: {type:DataTypes.INTEGER,allowNull:false},
    quantity: {type:DataTypes.INTEGER,allowNull:false},
    unitCost: {type:DataTypes.DECIMAL(20,6),allowNull:false}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"fields": ["lossId"]}]
};
