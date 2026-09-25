// Modèle Sequelize — table « users » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'User';
export const tableName = 'users';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    name: {type:DataTypes.STRING(150),allowNull:false},
    login: {type:DataTypes.STRING(80),allowNull:false},
    passwordHash: {type:DataTypes.STRING(120),allowNull:false},
    roleId: {type:DataTypes.INTEGER,allowNull:false},
    active: {type:DataTypes.BOOLEAN,allowNull:false,defaultValue:true},
    phone: {type:DataTypes.STRING(40),allowNull:false},
    note: {type:DataTypes.TEXT,allowNull:false,defaultValue:''},
    createdAt: {type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW},
    updatedAt: {type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW},
    lastLoginAt: {type:DataTypes.DATE,allowNull:true}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"unique": true, "fields": ["login"]},
  {"fields": ["roleId"]}]
};
