// Modèle Sequelize — table « sale_lines » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'SaleLine';
export const tableName = 'sale_lines';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    saleId: {type:DataTypes.INTEGER,allowNull:false},
    productId: {type:DataTypes.INTEGER,allowNull:false},
    lotId: {type:DataTypes.INTEGER,allowNull:false},
    // 2.7.12 — « quantity » reste exprimée en UNITÉ DE GESTION (la boîte), avec
    // décimales : 3 plaquettes = 0,3 boîte. Valeur/marge/mouvement inchangés.
    quantity: {type:DataTypes.DECIMAL(20,6),allowNull:false,
      get() { const v = this.getDataValue('quantity'); return v === null ? null : Number(v); }},
    // Traçabilité du choix de la caisse : l'unité vendue (BOX/BLISTER/UNIT),
    // le nombre tapé par le vendeur (ex. 3) et le facteur par boîte (ex. 10).
    saleUnit: {type:DataTypes.STRING(12),allowNull:false,defaultValue:'BOX'},
    saleQuantity: {type:DataTypes.DECIMAL(24,6),allowNull:false,defaultValue:1,
      get() { const v = this.getDataValue('saleQuantity'); return v === null ? 1 : Number(v); }},
    unitFactor: {type:DataTypes.INTEGER,allowNull:false,defaultValue:1},
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