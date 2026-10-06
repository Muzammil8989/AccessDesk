import type { KeycloakClient } from '@accessdesk/keycloak-client';
import type { Template } from '@accessdesk/shared';
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWK,
  type JWTVerifyGetKey,
} from 'jose';
import { vi } from 'vitest';
import { buildApp } from '../../src/app';
import type { Config } from '../../src/config';
import { createKeycloakClientFactory } from '../../src/infra/keycloak';
import type { TemplateRepository } from '../../src/modules/templates/templates.repository';

export const ISSUER = 'http://kc.test/realms/company-platform';
export const AUDIENCE = 'accessdesk';
export const USER_ID = '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11';

export const testConfig: Config = {
  keycloakUrl: 'http://kc.test',
  realm: 'company-platform',
  issuer: ISSUER,
  audience: AUDIENCE,
  databaseUrl: 'postgresql://unused',
  port: 0,
  host: '127.0.0.1',
  trustProxy: false,
  rateLimitPerMinute: 1000,
  logLevel: 'silent',
};

export interface TokenOptions {
  roles?: string[];
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  untrustedKey?: boolean;
}

export interface AuthHarness {
  keyResolver: JWTVerifyGetKey;
  makeToken(options?: TokenOptions): Promise<string>;
  makeHs256Token(): Promise<string>;
}

/** Real signing keys and a local JWKS, so tests exercise real JWT verification. */
export async function createAuthHarness(): Promise<AuthHarness> {
  const trusted = await generateKeyPair('RS256');
  const untrusted: CryptoKey = (await generateKeyPair('RS256')).privateKey;
  const jwk: JWK = {
    ...(await exportJWK(trusted.publicKey)),
    kid: 'test',
    alg: 'RS256',
    use: 'sig',
  };

  return {
    keyResolver: createLocalJWKSet({ keys: [jwk] }),
    makeToken: (options = {}) =>
      new SignJWT({ realm_access: { roles: options.roles ?? ['hr-admin'] } })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setSubject('admin-1')
        .setIssuer(options.issuer ?? ISSUER)
        .setAudience(options.audience ?? AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(options.expiresIn ?? '5m')
        .sign(options.untrustedKey ? untrusted : trusted.privateKey),
    makeHs256Token: () =>
      new SignJWT({ realm_access: { roles: ['super-admin'] } })
        .setProtectedHeader({ alg: 'HS256', kid: 'test' })
        .setSubject('admin-1')
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode('a-shared-secret-of-sufficient-length-1234')),
  };
}

export const sampleTemplates: Template[] = [
  {
    id: 't1',
    name: 'Developer',
    description: null,
    items: [
      { id: 'i1', title: 'Add to group', description: null, kind: 'GROUP_MEMBERSHIP', position: 0 },
    ],
  },
];

export function fakeTemplateRepository(
  templates: Template[] = sampleTemplates,
): TemplateRepository {
  return { listWithItems: vi.fn().mockResolvedValue(templates) };
}

export interface TestAppOptions {
  /** A fake Keycloak client. Wins over `fetch`. */
  keycloak?: Partial<KeycloakClient>;
  /** Goes through the real Keycloak client, to test what is sent over the wire. */
  fetch?: typeof fetch;
  templates?: TemplateRepository;
  checkDatabase?: () => Promise<void>;
  config?: Partial<Config>;
}

export function buildTestApp(harness: AuthHarness, options: TestAppOptions = {}) {
  const config = { ...testConfig, ...options.config };
  return buildApp({
    config,
    templates: options.templates ?? fakeTemplateRepository(),
    keycloakFor: options.keycloak
      ? () => options.keycloak as KeycloakClient
      : createKeycloakClientFactory(config, options.fetch),
    checkDatabase: options.checkDatabase ?? (async () => undefined),
    keyResolver: harness.keyResolver,
  });
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
