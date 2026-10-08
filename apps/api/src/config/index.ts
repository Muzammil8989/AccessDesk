import { accessPolicyEnvSchema } from '@accessdesk/identity';
import { z } from 'zod';

const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const IDENTITY_PROVIDERS = ['keycloak'] as const;
export type IdentityProviderId = (typeof IDENTITY_PROVIDERS)[number];

const envSchema = z.object({
  IDENTITY_PROVIDER: z.enum(IDENTITY_PROVIDERS).default('keycloak'),
  IDENTITY_ISSUER_URL: z.url({ protocol: /^https?$/ }),
  IDENTITY_CLIENT_ID: z.string().min(1),
  IDENTITY_AUDIENCE: z.string().min(1).optional(),
  ...accessPolicyEnvSchema.shape,
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_TRUST_PROXY: booleanFlag,
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface Config {
  identityProvider: IdentityProviderId;
  issuer: string;
  audience: string;
  adminRoles: string[];
  superAdminRole: string;
  rolesClaimPath: string;
  databaseUrl: string;
  port: number;
  host: string;
  trustProxy: boolean;
  rateLimitPerMinute: number;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))].join(', ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  const e = parsed.data;
  return {
    identityProvider: e.IDENTITY_PROVIDER,
    issuer: e.IDENTITY_ISSUER_URL.replace(/\/+$/, ''),
    audience: e.IDENTITY_AUDIENCE ?? e.IDENTITY_CLIENT_ID,
    adminRoles: e.AUTH_ADMIN_ROLES,
    superAdminRole: e.AUTH_SUPER_ADMIN_ROLE,
    rolesClaimPath: e.AUTH_ROLES_CLAIM_PATH,
    databaseUrl: e.DATABASE_URL,
    port: e.API_PORT,
    host: e.API_HOST,
    trustProxy: e.API_TRUST_PROXY,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    logLevel: e.LOG_LEVEL,
  };
}
