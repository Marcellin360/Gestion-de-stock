import { z } from 'zod';
import { identifier, shortText, optionalText } from './common.validator.js';

const base = {
  name: shortText,
  login: z.string().trim().min(3, '3 caractères minimum').max(80),
  roleId: identifier,
  active: z.boolean(),
  phone: optionalText,
  note: z.string().trim().max(2000).default('')
};

export const userCreateSchema = z.object({
  ...base,
  password: z.string().min(12, '12 caractères minimum').max(128)
}).strict();

export const userUpdateSchema = z.object({
  ...base,
  password: z.union([z.string().min(12, '12 caractères minimum').max(128), z.literal('')]).optional()
}).strict();
