// Modèle Sequelize — table « inventories » (cahier des charges §11)
import { DataTypes } from 'sequelize';

export const name = 'Inventory';
export const tableName = 'inventories';

export const attributes = {
  id: {type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true},
    reference: {type:DataTypes.STRING(40),allowNull:false},
    userId: {type:DataTypes.INTEGER,allowNull:false},
    location: {type:DataTypes.STRING(10),allowNull:false,defaultValue:'PHARMACY'},
    scope: {type:DataTypes.STRING(200),allowNull:false,defaultValue:''},
    note: {type:DataTypes.TEXT,allowNull:false,defaultValue:''},
    status: {type:DataTypes.STRING(20),allowNull:false},
    linesCount: {type:DataTypes.INTEGER,allowNull:false,defaultValue:0},
    createdAt: {type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW},
    validatedAt: {type:DataTypes.DATE,allowNull:true},
    validatedBy: {type:DataTypes.INTEGER,allowNull:true},
    adjustmentId: {type:DataTypes.INTEGER,allowNull:true}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false,
  indexes: [{"unique": true, "fields": ["reference"]}]
};
