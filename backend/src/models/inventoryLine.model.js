// Modèle Sequelize — table « inventory_lines » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'InventoryLine';
export const tableName = 'inventory_lines';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    inventoryId: {type:DataTypes.INTEGER,allowNull:false},
    productId: {type:DataTypes.INTEGER,allowNull:false},
    lotId: {type:DataTypes.INTEGER,allowNull:false},
    // 2.7.12 — décimales acceptées : après des ventes au détail le théorique
    // peut être fractionné (ex. 8,3 boîtes) et le comptage recopié à l'identique.
    theoretical: {type:DataTypes.DECIMAL(20,6),allowNull:false,
      get() { const v = this.getDataValue('theoretical'); return v === null ? null : Number(v); }},
    physical: {type:DataTypes.DECIMAL(20,6),allowNull:true,
      get() { const v = this.getDataValue('physical'); return v === null ? null : Number(v); }},
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