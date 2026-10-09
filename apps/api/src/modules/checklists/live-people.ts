import type { IdentityProvider } from '@accessdesk/identity';
import type { ChecklistPerson } from '@accessdesk/shared';

export const PEOPLE_LOOKUP_CONCURRENCY = 5;

async function personOf(
  identity: Pick<IdentityProvider, 'getUser'>,
  subjectId: string,
): Promise<ChecklistPerson | null> {
  try {
    const user = await identity.getUser(subjectId);
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return { displayName: name || user.username, username: user.username };
  } catch {
    return null;
  }
}

/**
 * Looks people up in the identity provider, at most PEOPLE_LOOKUP_CONCURRENCY at a time. A person
 * who cannot be looked up (removed, or the provider refused) is null. Nothing is stored.
 */
export async function lookupPeople(
  identity: Pick<IdentityProvider, 'getUser'>,
  subjectIds: readonly string[],
): Promise<Map<string, ChecklistPerson | null>> {
  const pending = [...new Set(subjectIds)];
  const people = new Map<string, ChecklistPerson | null>();
  let next = 0;

  async function worker(): Promise<void> {
    while (next < pending.length) {
      const subjectId = pending[next++]!;
      people.set(subjectId, await personOf(identity, subjectId));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PEOPLE_LOOKUP_CONCURRENCY, pending.length) }, worker),
  );
  return people;
}
