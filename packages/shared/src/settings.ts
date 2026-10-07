import { z } from 'zod';

const httpUrl = z.url({ protocol: /^https?$/ }).transform((v) => v.replace(/\/+$/, ''));

export const appSettingsSchema = z.object({
  issuerUrl: httpUrl.refine((value) => {
    const url = new URL(value);
    return !url.search && !url.hash && !url.username && !url.password;
  }, 'Must not contain a query, a fragment or credentials'),
  clientId: z
    .string()
    .trim()
    .min(1)
    .regex(/^[A-Za-z0-9._-]+$/, 'Letters, numbers, dot, dash and underscore only'),
  apiUrl: httpUrl,
});
export type AppSettings = z.infer<typeof appSettingsSchema>;
