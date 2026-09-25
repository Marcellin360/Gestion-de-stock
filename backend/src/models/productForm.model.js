// Modèle Sequelize — table « product_forms » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'ProductForm';
export const tableName = 'product_forms';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    name: {type:DataTypes.STRING(80),allowNull:false}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"unique": true, "fields": ["name"]}]
};
