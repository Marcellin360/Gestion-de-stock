// Inventaires : ouverture, saisie, validation, abandon (§9.13).
import { read, write } from '../utils/transaction.js';
import { openInventory, inventoryDetail, validateInventory, abandonInventory, listInventories } from '../services/inventory.service.js';

export async function list(req, res) {
  res.json(await read(transaction => listInventories(transaction)));
}

export async function open(req, res) {
  const inventory = await write(transaction => openInventory(req.body, req.user, transaction));
  res.status(201).json(inventory);
}

export async function detail(req, res) {
  res.json(await read(transaction => inventoryDetail(Number(req.params.id), transaction)));
}

export async function validate(req, res) {
  const result = await write(transaction => validateInventory(Number(req.params.id), req.body, req.user, transaction));
  res.json({ inventory: result.inventory, adjustment: result.adjustment, gaps: result.gaps, value: result.value });
}

export async function abandon(req, res) {
  res.json(await write(transaction => abandonInventory(Number(req.params.id), req.body.reason, req.user, transaction)));
}
