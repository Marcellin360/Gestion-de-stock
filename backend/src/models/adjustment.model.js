// Modèle Sequelize — table « adjustments » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'Adjustment';
export const tableName = 'adjustments';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    reference: {type:DataTypes.STRING(40),allowNull:false},
    inventoryId: {type:DataTypes.INTEGER,allowNull:true},
    userId: {type:DataTypes.INTEGER,allowNull:false},
    reason: {type:DataTypes.TEXT,allowNull:false,defaultValue:''},
    note: {type:DataTypes.TEXT,allowNull:false,defaultValue:''},
    costTotal: {type:DataTypes.DECIMAL(20,6),allowNull:false},
    status: {type:DataTypes.STRING(20),allowNull:false},
    requestKey: {type:DataTypes.UUID,allowNull:false},
    createdAt: {type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW},
    cancelledAt: {type:DataTypes.DATE,allowNull:true},
    cancelledBy: {type:DataTypes.INTEGER,allowNull:true},
    cancelReason: {type:DataTypes.TEXT,allowNull:true}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"unique": true, "fields": ["reference"]},
  {"unique": true, "fields": ["requestKey"]}]
};
