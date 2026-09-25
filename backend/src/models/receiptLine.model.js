// Modèle Sequelize — table « receipt_lines » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'ReceiptLine';
export const tableName = 'receipt_lines';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    receiptId: {type:DataTypes.INTEGER,allowNull:false},
    productId: {type:DataTypes.INTEGER,allowNull:false},
    lotId: {type:DataTypes.INTEGER,allowNull:false},
    number: {type:DataTypes.STRING(100),allowNull:false},
    quantity: {type:DataTypes.INTEGER,allowNull:false},
    purchasePrice: {type:DataTypes.DECIMAL(20,6),allowNull:false},
    allocatedFees: {type:DataTypes.DECIMAL(20,6),allowNull:false},
    unitCost: {type:DataTypes.DECIMAL(20,6),allowNull:false},
    receivedOn: {type:DataTypes.DATEONLY,allowNull:false},
    expiresOn: {type:DataTypes.DATEONLY,allowNull:true},
    manufacturedOn: {type:DataTypes.DATEONLY,allowNull:true}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"fields": ["receiptId"]},
  {"fields": ["lotId"]}]
};
