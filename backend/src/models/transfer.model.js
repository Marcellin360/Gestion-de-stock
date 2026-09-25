// Modèle Sequelize — table « transfers » (mouvement dépôt → pharmacie)
import { DataTypes } from 'sequelize';

export const name = 'Transfer';
export const tableName = 'transfers';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    reference: {type:DataTypes.STRING(40),allowNull:false},
    userId: {type:DataTypes.INTEGER,allowNull:false},
    fromLocation: {type:DataTypes.STRING(10),allowNull:false,defaultValue:'DEPOT'},
    toLocation: {type:DataTypes.STRING(10),allowNull:false,defaultValue:'PHARMACY'},
    requestedBy: {type:DataTypes.INTEGER,allowNull:true},
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
  indexes: [{"fields": ["createdAt"]}]
};
