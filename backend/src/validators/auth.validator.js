import { z } from 'zod';

export const loginSchema = z.object({
  login: z.string().trim().min(1, 'Identifiant requis').max(80),
  password: z.string().min(1, 'Mot de passe requis').max(200)
}).strict();

export const passwordChangeSchema = z.object({
  current: z.string().min(1, 'Mot de passe actuel requis').max(200),
  password: z.string().min(4, '4 caractères minimum').max(128)
}).strict();