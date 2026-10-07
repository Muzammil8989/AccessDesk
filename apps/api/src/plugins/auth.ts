import { readRolesFromClaims } from '@accessdesk/identity';
import { hasAdminAccess } from '@accessdesk/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { createDiscoveredKeyResolver } from './jwks';

export interface AuthContext {
  sub: string;
  roles: string[];
  token: string;
}

declare module 'fastify' {
  interface FastifyContextConfig {
    public?: boolean;
  }
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export interface AuthOptions {
  issuer: string;
  audience: string;
  adminRoles: readonly string[];
  rolesClaimPath: string;
  keyResolver?: JWTVerifyGetKey;
  fetch?: typeof globalThis.fetch;
}

const subjectSchema = z.string();
export function registerAuth(app: FastifyInstance, options: AuthOptions): void {
  const forbiddenMessage = `Requires the ${options.adminRoles.join(' or ')} role`;

  const keys = options.keyResolver ?? createDiscoveredKeyResolver(options.issuer, options.fetch);

  app.decorateRequest('auth');

  app.addHook('preParsing', async (request, reply, payload) => {
    if (request.routeOptions.config.public) return payload;

    const token = /^Bearer (\S+)$/i.exec(request.headers.authorization ?? '')?.[1];
    if (!token) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Missing bearer token' });
    }

    let sub: string;
    let roles: string[];
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ['RS256', 'PS256', 'ES256'],
      });
      sub = subjectSchema.parse(payload.sub);
      roles = readRolesFromClaims(payload, options.rolesClaimPath);
    } catch (error) {
      request.log.info(
        { reason: error instanceof Error ? error.name : 'unknown' },
        'Token rejected',
      );
      return reply.code(401).send({ error: 'unauthorized', message: 'Invalid or expired token' });
    }

    if (!hasAdminAccess(roles, options.adminRoles)) {
      return reply.code(403).send({ error: 'forbidden', message: forbiddenMessage });
    }

    request.auth = { sub, roles, token };
    return payload;
  });
}

export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new Error('Authentication context missing');
  return request.auth;
}
