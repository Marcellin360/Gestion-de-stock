// Modèle Sequelize — table « categories » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'Category';
export const tableName = 'categories';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    name: {type:DataTypes.STRING(150),allowNull:false},
    description: {type:DataTypes.TEXT,allowNull:false,defaultValue:''},
    active: {type:DataTypes.BOOLEAN,allowNull:false,defaultValue:true},
    createdAt: {type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"unique": true, "fields": ["name"]}]
};
