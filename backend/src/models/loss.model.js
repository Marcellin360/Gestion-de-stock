// Modèle Sequelize — table « losses » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'Loss';
export const tableName = 'losses';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    reference: {type:DataTypes.STRING(40),allowNull:false},
    userId: {type:DataTypes.INTEGER,allowNull:false},
    location: {type:DataTypes.STRING(10),allowNull:false,defaultValue:'PHARMACY'},
    reason: {type:DataTypes.STRING(40),allowNull:false},
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
