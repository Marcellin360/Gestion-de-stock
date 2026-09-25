// Modèle Sequelize — table « lots » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'Lot';
export const tableName = 'lots';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    productId: {type:DataTypes.INTEGER,allowNull:false},
    supplierId: {type:DataTypes.INTEGER,allowNull:false},
    location: {type:DataTypes.STRING(10),allowNull:false,defaultValue:'DEPOT'},
    number: {type:DataTypes.STRING(100),allowNull:false},
    receivedOn: {type:DataTypes.DATEONLY,allowNull:false},
    manufacturedOn: {type:DataTypes.DATEONLY,allowNull:true},
    expiresOn: {type:DataTypes.DATEONLY,allowNull:true},
    quantity: {type:DataTypes.INTEGER,allowNull:false,defaultValue:0},
    receivedQuantity: {type:DataTypes.INTEGER,allowNull:false,defaultValue:0},
    purchasePrice: {type:DataTypes.DECIMAL(20,6),allowNull:false},
    allocatedFees: {type:DataTypes.DECIMAL(20,6),allowNull:false},
    unitCost: {type:DataTypes.DECIMAL(20,6),allowNull:false},
    status: {type:DataTypes.STRING(20),allowNull:false},
    blockReason: {type:DataTypes.TEXT,allowNull:true},
    createdAt: {type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"unique": true, "fields": ["productId", "supplierId", "number", "location"]},
  {"fields": ["expiresOn"]}]
};
