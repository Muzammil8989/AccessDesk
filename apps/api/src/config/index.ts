import { z } from 'zod';

// Environment variables arrive as strings, so "true"/"false" need an explicit conversion.
const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  KEYCLOAK_URL: z.url(),
  KEYCLOAK_REALM: z.string().min(1),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_AUDIENCE: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  // Loopback by default. Set to 0.0.0.0 only when deploying behind a reverse proxy.
  API_HOST: z.string().min(1).default('127.0.0.1'),
  // Trust X-Forwarded-* headers. Only enable behind a reverse proxy you control, otherwise
  // clients could fake their IP address and dodge the rate limit.
  API_TRUST_PROXY: booleanFlag,
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface Config {
  keycloakUrl: string;
  realm: string;
  /** Token issuer, as Keycloak puts it in the `iss` claim. */
  issuer: string;
  /** Expected `aud` claim of access tokens. */
  audience: string;
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
    // Names only: never echo values, they may contain secrets.
    const problems = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  const e = parsed.data;
  const keycloakUrl = e.KEYCLOAK_URL.replace(/\/+$/, '');
  return {
    keycloakUrl,
    realm: e.KEYCLOAK_REALM,
    issuer: `${keycloakUrl}/realms/${e.KEYCLOAK_REALM}`,
    audience: e.KEYCLOAK_AUDIENCE ?? e.KEYCLOAK_CLIENT_ID,
    databaseUrl: e.DATABASE_URL,
    port: e.API_PORT,
    host: e.API_HOST,
    trustProxy: e.API_TRUST_PROXY,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    logLevel: e.LOG_LEVEL,
  };
}
