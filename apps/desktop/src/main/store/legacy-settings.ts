const LEGACY_REALM = /^[A-Za-z0-9._-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function migrateLegacySettings(raw: unknown): unknown {
  if (!isRecord(raw) || 'issuerUrl' in raw) return raw;
  const { keycloakUrl, realm, ...rest } = raw;
  if (typeof keycloakUrl !== 'string' || typeof realm !== 'string') return raw;
  if (!LEGACY_REALM.test(realm)) return raw;
  return { ...rest, issuerUrl: `${keycloakUrl.replace(/\/+$/, '')}/realms/${realm}` };
}
