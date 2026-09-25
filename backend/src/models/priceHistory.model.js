// Modèle Sequelize — table « price_history » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'PriceHistory';
export const tableName = 'price_history';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    productId: {type:DataTypes.INTEGER,allowNull:false},
    userId: {type:DataTypes.INTEGER,allowNull:false},
    cost: {type:DataTypes.DECIMAL(20,6),allowNull:false},
    rate: {type:DataTypes.DECIMAL(5,2),allowNull:false},
    price: {type:DataTypes.DECIMAL(20,6),allowNull:false},
    mode: {type:DataTypes.STRING(10),allowNull:false},
    origin: {type:DataTypes.STRING(60),allowNull:false,defaultValue:''},
    reason: {type:DataTypes.STRING(255),allowNull:false,defaultValue:''},
    createdAt: {type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"fields": ["productId"]}]
};
