// Modèle Sequelize — table « movement_superseded » (2.7.91/2.7.92)
// Marque « registre net » (« safidy A », choix du dépôt) : une ligne = un
// mouvement SUPPLANTÉ (version remplacée par une correction validée,
// contre-écriture CANCEL, écriture d'un document annulé) que les fiches de
// stock ignorent dans leurs colonnes Initial/Entrées/Sorties/Final.
// ⚠ La marque vit ICI et non dans « movements » : le trigger
// « movements_immutable » (RG19, sql/001) interdit tout UPDATE du journal —
// cette table est INSERT-only (bulkCreate … ignoreDuplicates : rejouable).
// Le journal « Mouvements » et l'audit continuent de TOUT montrer.
import { DataTypes } from 'sequelize';

export const name = 'MovementSuperseded';
export const tableName = 'movement_superseded';

export const attributes = {
  movementId: {type:DataTypes.INTEGER,primaryKey:true},
  createdAt: {type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW}
};

export const options = {
  tableName,
  underscored: true,
  timestamps: false
};