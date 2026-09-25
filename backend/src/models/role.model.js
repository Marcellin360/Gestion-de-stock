// Modèle Sequelize — table « roles » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'Role';
export const tableName = 'roles';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    code: {type:DataTypes.STRING(20),allowNull:false},
    name: {type:DataTypes.STRING(100),allowNull:false},
    permissions: {type:DataTypes.JSONB,allowNull:true,defaultValue:'[]'},
    createdAt: {type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"unique": true, "fields": ["code"]}]
};
