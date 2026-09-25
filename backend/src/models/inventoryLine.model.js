// Modèle Sequelize — table « inventory_lines » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'InventoryLine';
export const tableName = 'inventory_lines';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    inventoryId: {type:DataTypes.INTEGER,allowNull:false},
    productId: {type:DataTypes.INTEGER,allowNull:false},
    lotId: {type:DataTypes.INTEGER,allowNull:false},
    theoretical: {type:DataTypes.INTEGER,allowNull:false},
    physical: {type:DataTypes.INTEGER,allowNull:true},
    reason: {type:DataTypes.TEXT,allowNull:false,defaultValue:''},
    productVersion: {type:DataTypes.INTEGER,allowNull:false},
    countedAt: {type:DataTypes.DATE,allowNull:true}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"fields": ["inventoryId"]}]
};
