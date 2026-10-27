// Utilisateurs et rôles (§9.1, RG18).
import { read, write } from '../utils/transaction.js';
import { listUsers, listRoles, createUser, updateUser, deleteUser } from '../services/user.service.js';

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

// 2.7.29 — suppression définitive d'un compte (administrateur, avec garde-fous).
export async function destroy(req, res) {
  res.json(await write(transaction => deleteUser(Number(req.params.id), req.user, transaction)));
}