// Utilisateurs et rôles (§9.1, RG18).
import { read, write } from '../utils/transaction.js';
import { listUsers, listRoles, createUser, updateUser } from '../services/user.service.js';

export async function list(req, res) {
  res.json(await read(transaction => listUsers(transaction)));
}

export async function roles(req, res) {
  res.json(await read(transaction => listRoles(transaction)));
}

export async function create(req, res) {
  res.status(201).json(await write(transaction => createUser(req.body, req.user, transaction)));
}

export async function update(req, res) {
  res.json(await write(transaction => updateUser(Number(req.params.id), req.body, req.user, transaction)));
}
