// ============================================================================
// Registre central des modèles Sequelize (une table = un fichier de modèle)
// ============================================================================
import { sequelize } from '../config/database.js';
import * as adjustment from './adjustment.model.js';
import * as adjustmentLine from './adjustmentLine.model.js';
import * as auditLog from './auditLog.model.js';
import * as category from './category.model.js';
import * as inventory from './inventory.model.js';
import * as inventoryLine from './inventoryLine.model.js';
import * as loss from './loss.model.js';
import * as lossLine from './lossLine.model.js';
import * as lot from './lot.model.js';
import * as movement from './movement.model.js';
import * as priceHistory from './priceHistory.model.js';
import * as product from './product.model.js';
import * as productForm from './productForm.model.js';
import * as receipt from './receipt.model.js';
import * as receiptLine from './receiptLine.model.js';
import * as role from './role.model.js';
import * as sale from './sale.model.js';
import * as transfer from './transfer.model.js';
import * as transferLine from './transferLine.model.js';
import * as saleLine from './saleLine.model.js';
import * as session from './session.model.js';
import * as setting from './setting.model.js';
import * as supplier from './supplier.model.js';
import * as unitOfMeasure from './unitOfMeasure.model.js';
import * as user from './user.model.js';

const definitions = [
  adjustment,
  adjustmentLine,
  auditLog,
  category,
  inventory,
  inventoryLine,
  loss,
  lossLine,
  lot,
  movement,
  priceHistory,
  product,
  productForm,
  receipt,
  receiptLine,
  role,
  sale,
  saleLine,
  session,
  setting,
  supplier,
  transfer,
  transferLine,
  unitOfMeasure,
  user
];

/** Tous les modèles indexés par nom. */
export const db = {};

for (const definition of definitions) {
  db[definition.name] = sequelize.define(definition.name, definition.attributes, definition.options);
}

// Raccourcis nommés : import { Product, Lot } from '../models/index.js'
export const {
  Adjustment,
  AdjustmentLine,
  AuditLog,
  Category,
  Inventory,
  InventoryLine,
  Loss,
  LossLine,
  Lot,
  Movement,
  PriceHistory,
  Product,
  ProductForm,
  Receipt,
  ReceiptLine,
  Role,
  Sale,
  SaleLine,
  Session,
  Setting,
  Supplier,
  Transfer,
  TransferLine,
  UnitOfMeasure,
  User
} = db;

// ---------------------------------------------------------------- Associations
// Un médicament peut posséder plusieurs lots (RG01) ; un lot garde son coût propre (RG02).
Product.belongsTo(Category, { as: 'category', foreignKey: 'categoryId' });
Category.hasMany(Product, { as: 'products', foreignKey: 'categoryId' });

Lot.belongsTo(Product, { as: 'product', foreignKey: 'productId' });
Lot.belongsTo(Supplier, { as: 'supplier', foreignKey: 'supplierId' });
Product.hasMany(Lot, { as: 'lots', foreignKey: 'productId' });
Supplier.hasMany(Lot, { as: 'lots', foreignKey: 'supplierId' });

User.belongsTo(Role, { as: 'role', foreignKey: 'roleId' });
Role.hasMany(User, { as: 'users', foreignKey: 'roleId' });
Session.belongsTo(User, { as: 'user', foreignKey: 'userId' });
User.hasMany(Session, { as: 'sessions', foreignKey: 'userId' });


Receipt.belongsTo(Supplier, { as: 'supplier', foreignKey: 'supplierId' });
Receipt.belongsTo(User, { as: 'author', foreignKey: 'userId' });
Receipt.hasMany(ReceiptLine, { as: 'lines', foreignKey: 'receiptId' });
ReceiptLine.belongsTo(Receipt, { as: 'receipt', foreignKey: 'receiptId' });
ReceiptLine.belongsTo(Lot, { as: 'lot', foreignKey: 'lotId' });
ReceiptLine.belongsTo(Product, { as: 'product', foreignKey: 'productId' });

Sale.belongsTo(User, { as: 'author', foreignKey: 'userId' });
Sale.hasMany(SaleLine, { as: 'lines', foreignKey: 'saleId' });
SaleLine.belongsTo(Sale, { as: 'sale', foreignKey: 'saleId' });
SaleLine.belongsTo(Lot, { as: 'lot', foreignKey: 'lotId' });
SaleLine.belongsTo(Product, { as: 'product', foreignKey: 'productId' });

Loss.belongsTo(User, { as: 'author', foreignKey: 'userId' });
Loss.hasMany(LossLine, { as: 'lines', foreignKey: 'lossId' });
LossLine.belongsTo(Loss, { as: 'loss', foreignKey: 'lossId' });
LossLine.belongsTo(Lot, { as: 'lot', foreignKey: 'lotId' });


Inventory.belongsTo(User, { as: 'author', foreignKey: 'userId' });
Inventory.hasMany(InventoryLine, { as: 'lines', foreignKey: 'inventoryId' });
InventoryLine.belongsTo(Inventory, { as: 'inventory', foreignKey: 'inventoryId' });
InventoryLine.belongsTo(Lot, { as: 'lot', foreignKey: 'lotId' });
Inventory.belongsTo(Adjustment, { as: 'adjustment', foreignKey: 'adjustmentId' });

Adjustment.belongsTo(Inventory, { as: 'inventory', foreignKey: 'inventoryId' });
Adjustment.belongsTo(User, { as: 'author', foreignKey: 'userId' });
Adjustment.hasMany(AdjustmentLine, { as: 'lines', foreignKey: 'adjustmentId' });
AdjustmentLine.belongsTo(Adjustment, { as: 'adjustment', foreignKey: 'adjustmentId' });

Transfer.belongsTo(User, { as: 'author', foreignKey: 'userId' });
Transfer.belongsTo(User, { as: 'requester', foreignKey: 'requestedBy' });
Transfer.hasMany(TransferLine, { as: 'lines', foreignKey: 'transferId' });
TransferLine.belongsTo(Transfer, { as: 'transfer', foreignKey: 'transferId' });
TransferLine.belongsTo(Lot, { as: 'fromLot', foreignKey: 'fromLotId' });
TransferLine.belongsTo(Lot, { as: 'toLot', foreignKey: 'toLotId' });

Movement.belongsTo(Lot, { as: 'lot', foreignKey: 'lotId' });
Movement.belongsTo(Product, { as: 'product', foreignKey: 'productId' });
Movement.belongsTo(User, { as: 'author', foreignKey: 'userId' });

PriceHistory.belongsTo(Product, { as: 'product', foreignKey: 'productId' });
PriceHistory.belongsTo(User, { as: 'author', foreignKey: 'userId' });
AuditLog.belongsTo(User, { as: 'author', foreignKey: 'userId' });

export { sequelize };
export default db;
