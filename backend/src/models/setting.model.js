// Modèle Sequelize — table « settings » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'Setting';
export const tableName = 'settings';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    pharmacyName: {type:DataTypes.STRING(150),allowNull:false},
    address: {type:DataTypes.TEXT,allowNull:false,defaultValue:''},
    phone: {type:DataTypes.STRING(40),allowNull:false,defaultValue:''},
    managerName: {type:DataTypes.STRING(150),allowNull:false,defaultValue:''},
    currency: {type:DataTypes.STRING(10),allowNull:false},
    valuation: {type:DataTypes.STRING(10),allowNull:false},
    // Base de calcul du PRIX DE VENTE (2.7.8) : CMP (moyenne des réceptions,
    // défaut) ou coût du dernier lot reçu. Indépendante de la valorisation du
    // stock, qui reste figée dès le premier mouvement.
    pricingBasis: {type:DataTypes.STRING(10),allowNull:false,defaultValue:'CMP'},
    marginMode: {type:DataTypes.STRING(10),allowNull:false},
    minMargin: {type:DataTypes.DECIMAL(5,2),allowNull:false},
    maxMargin: {type:DataTypes.DECIMAL(5,2),allowNull:false},
    // 2.7.47 — frais d'achat AUTOMATIQUES, en % du prix d'achat (migration 011).
    // Appliqués à chaque lot d'une réception : coût unitaire = PA × (1 + taux/100).
    feesRate: {type:DataTypes.DECIMAL(5,2),allowNull:false,defaultValue:10},
    expiryDays: {type:DataTypes.INTEGER,allowNull:false,defaultValue:90},
    allowExpiredSale: {type:DataTypes.BOOLEAN,allowNull:false,defaultValue:false},
    updatedAt: {type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: []
};