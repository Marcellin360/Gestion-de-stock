// Modèle Sequelize — table « sale_lines » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'SaleLine';
export const tableName = 'sale_lines';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    saleId: {type:DataTypes.INTEGER,allowNull:false},
    productId: {type:DataTypes.INTEGER,allowNull:false},
    lotId: {type:DataTypes.INTEGER,allowNull:false},
    quantity: {type:DataTypes.INTEGER,allowNull:false},
    unitPrice: {type:DataTypes.DECIMAL(20,6),allowNull:false},
    unitCost: {type:DataTypes.DECIMAL(20,6),allowNull:false},
    marginRate: {type:DataTypes.DECIMAL(5,2),allowNull:false},
    margin: {type:DataTypes.DECIMAL(20,6),allowNull:false}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"fields": ["saleId"]}]
};
