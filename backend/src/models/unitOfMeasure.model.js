// Modèle Sequelize — table « units_of_measure » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'UnitOfMeasure';
export const tableName = 'units_of_measure';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    name: {type:DataTypes.STRING(40),allowNull:false}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"unique": true, "fields": ["name"]}]
};
