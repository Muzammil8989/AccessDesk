import type { IdentityProvider } from '@accessdesk/identity';
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
import { createIdentityProviderFactory } from '../../src/infra/identity';
import type { AuditRepository } from '../../src/modules/audit/audit.repository';
import type { TemplateRepository } from '../../src/modules/templates/templates.repository';
import type { ChecklistRepository } from '../../src/modules/checklists/checklists.repository';
import { InMemoryAuditRepository } from './in-memory-audit';
import { InMemoryChecklistRepository } from './in-memory-checklists';

export const ISSUER = 'http://idp.test/realms/company-platform';
export const AUDIENCE = 'accessdesk';
export const USER_ID = '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11';

export const testConfig: Config = {
  identityProvider: 'keycloak',
  issuer: ISSUER,
  audience: AUDIENCE,
  adminRoles: ['super-admin', 'hr-admin'],
  superAdminRole: 'super-admin',
  rolesClaimPath: 'realm_access.roles',
  databaseUrl: 'postgresql://unused',
  port: 0,
  host: '127.0.0.1',
  trustProxy: false,
  rateLimitPerMinute: 1000,
  logLevel: 'silent',
};

export interface TokenOptions {
  roles?: string[];
  subject?: string;
  claims?: Record<string, unknown>;
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  untrustedKey?: boolean;
}

export interface AuthHarness {
  keyResolver: JWTVerifyGetKey;
  jwks: { keys: JWK[] };
  makeToken(options?: TokenOptions): Promise<string>;
  makeHs256Token(): Promise<string>;
}

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
    jwks: { keys: [jwk] },
    makeToken: (options = {}) =>
      new SignJWT(options.claims ?? { realm_access: { roles: options.roles ?? ['hr-admin'] } })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setSubject(options.subject ?? 'admin-1')
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
    departmentRef: null,
    defaultRole: null,
    items: [
      {
        id: 'i1',
        title: 'Add to group',
        description: null,
        kind: 'GROUP_MEMBERSHIP',
        targetRef: '/Engineering',
        position: 0,
      },
    ],
  },
];

export function fakeTemplateRepository(
  templates: Template[] = sampleTemplates,
): TemplateRepository {
  return {
    listWithItems: vi.fn().mockResolvedValue(templates),
    findById: vi.fn(async (id: string) => templates.find((template) => template.id === id) ?? null),
  };
}

export interface TestAppOptions {
  identity?: Partial<IdentityProvider>;
  fetch?: typeof fetch;
  templates?: TemplateRepository;
  audit?: AuditRepository;
  checklists?: ChecklistRepository;
  checkDatabase?: () => Promise<void>;
  config?: Partial<Config>;
  discoverKeys?: boolean;
  clock?: () => Date;
  generatePassword?: () => string;
  logStream?: NodeJS.WritableStream;
}

export function buildTestApp(harness: AuthHarness, options: TestAppOptions = {}) {
  const config = { ...testConfig, ...options.config };
  const audit = options.audit ?? new InMemoryAuditRepository();
  return buildApp({
    config,
    templates: options.templates ?? fakeTemplateRepository(),
    audit,
    checklists: options.checklists ?? new InMemoryChecklistRepository(audit),
    clock: options.clock,
    generatePassword: options.generatePassword,
    logStream: options.logStream,
    identityFor: options.identity
      ? () => options.identity as IdentityProvider
      : createIdentityProviderFactory(config, options.fetch),
    checkDatabase: options.checkDatabase ?? (async () => undefined),
    keyResolver: options.discoverKeys ? undefined : harness.keyResolver,
    fetch: options.fetch,
  });
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
