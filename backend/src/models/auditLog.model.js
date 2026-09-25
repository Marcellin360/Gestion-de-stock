// Modèle Sequelize — table « audit_logs » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'AuditLog';
export const tableName = 'audit_logs';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    userId: {type:DataTypes.INTEGER,allowNull:true},
    action: {type:DataTypes.STRING(80),allowNull:false},
    entity: {type:DataTypes.STRING(80),allowNull:false},
    entityId: {type:DataTypes.INTEGER,allowNull:true},
    before: {type:DataTypes.JSONB,allowNull:true,defaultValue:null},
    after: {type:DataTypes.JSONB,allowNull:true,defaultValue:null},
    ip: {type:DataTypes.STRING(60),allowNull:true},
    createdAt: {type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"fields": ["createdAt"]}]
};
