// Modèle Sequelize — table « suppliers » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'Supplier';
export const tableName = 'suppliers';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    name: {type:DataTypes.STRING(200),allowNull:false},
    contact: {type:DataTypes.STRING(150),allowNull:false,defaultValue:''},
    phone: {type:DataTypes.STRING(40),allowNull:false,defaultValue:''},
    email: {type:DataTypes.STRING(150),allowNull:false,defaultValue:''},
    address: {type:DataTypes.TEXT,allowNull:false,defaultValue:''},
    nif: {type:DataTypes.STRING(40),allowNull:false,defaultValue:''},
    note: {type:DataTypes.TEXT,allowNull:false,defaultValue:''},
    active: {type:DataTypes.BOOLEAN,allowNull:false,defaultValue:true},
    createdAt: {type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"fields": ["name"]}]
};
