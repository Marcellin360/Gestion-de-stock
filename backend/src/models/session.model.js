// Modèle Sequelize — table « sessions » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'Session';
export const tableName = 'sessions';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    tokenHash: {type:DataTypes.STRING(64),allowNull:false},
    userId: {type:DataTypes.INTEGER,allowNull:false},
    csrf: {type:DataTypes.STRING(64),allowNull:false},
    expiresAt: {type:DataTypes.DATE,allowNull:false},
    createdAt: {type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW},
    ip: {type:DataTypes.STRING(60),allowNull:true},
    userAgent: {type:DataTypes.STRING(255),allowNull:true}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"fields": ["userId"]}]
};
