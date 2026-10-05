// Modèle Sequelize — table « products » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'Product';
export const tableName = 'products';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    code: {type:DataTypes.STRING(80),allowNull:false},
    name: {type:DataTypes.STRING(200),allowNull:false},
    ingredient: {type:DataTypes.STRING(200),allowNull:false,defaultValue:''},
    dosage: {type:DataTypes.STRING(100),allowNull:false,defaultValue:''},
    form: {type:DataTypes.STRING(80),allowNull:false,defaultValue:''},
    presentation: {type:DataTypes.STRING(150),allowNull:false,defaultValue:''},
    barcode: {type:DataTypes.STRING(255),allowNull:true},
    categoryId: {type:DataTypes.INTEGER,allowNull:true},
    manufacturer: {type:DataTypes.STRING(200),allowNull:false,defaultValue:''},
    unit: {type:DataTypes.STRING(40),allowNull:false},
    minStock: {type:DataTypes.INTEGER,allowNull:false,defaultValue:5},
    maxStock: {type:DataTypes.INTEGER,allowNull:true},
    storage: {type:DataTypes.TEXT,allowNull:false,defaultValue:''},
    note: {type:DataTypes.TEXT,allowNull:false,defaultValue:''},
    active: {type:DataTypes.BOOLEAN,allowNull:false,defaultValue:true},
    marginRate: {type:DataTypes.DECIMAL(5,2),allowNull:false},
    sellingPrice: {type:DataTypes.DECIMAL(20,6),allowNull:false},
    cmp: {type:DataTypes.DECIMAL(20,6),allowNull:false},
    // 2.7.12 — vente au détail (boîte / plaquette / vongany) :
    // conditionnement (matetika 10 et 10) et PRIX INDÉPENDANTS de chaque unité.
    // 0 plaquettes = ce médicament ne se vend pas par plaquette ni par vongany ;
    // prix 0 = calculé automatiquement au prorata du prix de la boîte à la vente.
    blistersPerBox: {type:DataTypes.INTEGER,allowNull:false,defaultValue:10},
    unitsPerBlister: {type:DataTypes.INTEGER,allowNull:false,defaultValue:10},
    pricePerBlister: {type:DataTypes.DECIMAL(20,6),allowNull:false,defaultValue:0},
    pricePerUnit: {type:DataTypes.DECIMAL(20,6),allowNull:false,defaultValue:0},
    version: {type:DataTypes.INTEGER,allowNull:false,defaultValue:0},
    createdAt: {type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW},
    updatedAt: {type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"unique": true, "fields": ["code"]},
  {"unique": true, "fields": ["barcode"]},
  {"fields": ["name"]}]
};