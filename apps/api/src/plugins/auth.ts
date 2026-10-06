import { hasAdminAccess } from '@accessdesk/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';

export interface AuthContext {
  sub: string;
  roles: string[];
  /** The admin's own access token, forwarded to Keycloak. Never log it. */
  token: string;
}

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Routes marked public skip authentication (only /health). */
    public?: boolean;
  }
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export interface AuthOptions {
  issuer: string;
  audience: string;
  /** Resolves the signing key. Defaults to the realm's JWKS endpoint. */
  keyResolver?: JWTVerifyGetKey;
}

const claimsSchema = z.object({
  sub: z.string(),
  realm_access: z.object({ roles: z.array(z.string()) }).optional(),
});

export function registerAuth(app: FastifyInstance, options: AuthOptions): void {
  // jose caches the key set and refetches when it meets an unknown key ID.
  const keys =
    options.keyResolver ??
    createRemoteJWKSet(new URL(`${options.issuer}/protocol/openid-connect/certs`));

  app.decorateRequest('auth');

  // Runs in `preParsing`, not `onRequest`, on purpose. The rate limiter works per route in
  // `onRequest`, and Fastify runs global `onRequest` hooks BEFORE route ones, so an
  // `onRequest` auth check would reject bad tokens before the limiter could count them.
  // `preParsing` still runs before the request body is read, so unauthenticated callers
  // cannot make us parse anything.
  app.addHook('preParsing', async (request, reply, payload) => {
    if (request.routeOptions.config.public) return payload;

    const token = /^Bearer (\S+)$/i.exec(request.headers.authorization ?? '')?.[1];
    if (!token) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Missing bearer token' });
    }

    let claims: z.infer<typeof claimsSchema>;
    try {
      // Checks signature, expiry, issuer and audience. Algorithms are pinned
      // so a token cannot pick a weaker one (such as "none" or HS256).
      const { payload } = await jwtVerify(token, keys, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ['RS256', 'PS256', 'ES256'],
      });
      claims = claimsSchema.parse(payload);
    } catch (error) {
      // Log the reason, never the token.
      request.log.info(
        { reason: error instanceof Error ? error.name : 'unknown' },
        'Token rejected',
      );
      return reply.code(401).send({ error: 'unauthorized', message: 'Invalid or expired token' });
    }

    const roles = claims.realm_access?.roles ?? [];
    if (!hasAdminAccess(roles)) {
      return reply
        .code(403)
        .send({ error: 'forbidden', message: 'Requires the super-admin or hr-admin role' });
    }

    request.auth = { sub: claims.sub, roles, token };
    return payload;
  });
}

/** The guard has already run for every non-public route, so this only narrows the type. */
export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new Error('Authentication context missing');
  return request.auth;
}
