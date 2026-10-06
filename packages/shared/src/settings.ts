import { z } from 'zod';

// Local desktop settings. Public values only: no client secret exists for this app.
export const appSettingsSchema = z.object({
  keycloakUrl: z.url({ protocol: /^https?$/ }).transform((v) => v.replace(/\/+$/, '')),
  realm: z
    .string()
    .trim()
    .min(1)
    .regex(/^[A-Za-z0-9._-]+$/, 'Letters, numbers, dot, dash and underscore only'),
  clientId: z
    .string()
    .trim()
    .min(1)
    .regex(/^[A-Za-z0-9._-]+$/, 'Letters, numbers, dot, dash and underscore only'),
  apiUrl: z.url({ protocol: /^https?$/ }).transform((v) => v.replace(/\/+$/, '')),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;
