// Modèle Sequelize — table « movements » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'Movement';
export const tableName = 'movements';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    documentType: {type:DataTypes.STRING(20),allowNull:false},
    documentId: {type:DataTypes.INTEGER,allowNull:false},
    productId: {type:DataTypes.INTEGER,allowNull:false},
    lotId: {type:DataTypes.INTEGER,allowNull:false},
    location: {type:DataTypes.STRING(10),allowNull:false,defaultValue:'PHARMACY'},
    // 2.7.12 — décimales acceptées (0,1 boîte sortie pour 1 plaquette vendue).
    // L'accesseur renvoie un NOMBRE (sauf dans les agrégats SQL bruts).
    quantity: {type:DataTypes.DECIMAL(20,6),allowNull:false,
      get() { const v = this.getDataValue('quantity'); return v === null ? null : Number(v); }},
    unitCost: {type:DataTypes.DECIMAL(20,6),allowNull:false},
    kind: {type:DataTypes.STRING(30),allowNull:false},
    reason: {type:DataTypes.TEXT,allowNull:false,defaultValue:''},
    userId: {type:DataTypes.INTEGER,allowNull:false},
    createdAt: {type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"fields": ["documentType", "documentId"]},
  {"fields": ["lotId"]},
  {"fields": ["createdAt"]}]
};