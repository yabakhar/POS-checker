import { z } from 'zod';

// Enforced whenever a new credential is being set (client creation, password reset) — NOT on
// login, which just checks an existing password and must keep accepting whatever was valid
// when that password was set.
export const strongPasswordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters long.')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
  .regex(/[0-9]/, 'Password must contain at least one digit.')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character.');

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required.'),
  password: z.string().min(1, 'Password is required.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createClientSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters long.').max(100),
  password: strongPasswordSchema,
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const resetPasswordSchema = z.object({
  password: strongPasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// The real agent payload is `{ type, data, collectedAt }` (see agent/src/httpClient.js) — this
// only pins down the two fields the ingestion route actually relies on, and leaves room for
// the agent to send extra fields later without breaking ingestion.
export const agentDataSchema = z
  .object({
    type: z.string().min(1, 'type is required.'),
    data: z.array(z.unknown()),
  })
  .passthrough();
export type AgentDataInput = z.infer<typeof agentDataSchema>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const dateRangeQuerySchema = z.object({
  from: z.string().regex(DATE_RE, 'from must be in YYYY-MM-DD format.').optional(),
  to: z.string().regex(DATE_RE, 'to must be in YYYY-MM-DD format.').optional(),
});
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;
