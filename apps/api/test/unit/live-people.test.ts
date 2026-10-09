import { IdentityProviderError, type IdentityUser } from '@accessdesk/identity';
import { describe, expect, it } from 'vitest';
import { lookupPeople, PEOPLE_LOOKUP_CONCURRENCY } from '../../src/modules/checklists/live-people';

const user = (subjectId: string, overrides: Partial<IdentityUser> = {}): IdentityUser => ({
  subjectId,
  username: `user-${subjectId}`,
  email: null,
  firstName: null,
  lastName: null,
  enabled: true,
  emailVerified: false,
  createdAt: null,
  ...overrides,
});

describe('lookupPeople', () => {
  it('builds a display name from the first and last name, and falls back to the username', async () => {
    const users = new Map([
      ['a', user('a', { firstName: 'Ann', lastName: 'Lee' })],
      ['b', user('b', { firstName: 'Bob' })],
      ['c', user('c')],
    ]);

    const people = await lookupPeople({ getUser: async (id) => users.get(id)! }, ['a', 'b', 'c']);

    expect(people.get('a')).toEqual({ displayName: 'Ann Lee', username: 'user-a' });
    expect(people.get('b')).toEqual({ displayName: 'Bob', username: 'user-b' });
    expect(people.get('c')).toEqual({ displayName: 'user-c', username: 'user-c' });
  });

  it('answers null for anyone it cannot look up, without failing the others', async () => {
    const people = await lookupPeople(
      {
        getUser: async (id) => {
          if (id === 'gone') throw new IdentityProviderError(404, 'User not found');
          if (id === 'refused') throw new IdentityProviderError(403, 'forbidden');
          if (id === 'broken') throw new Error('boom');
          return user(id);
        },
      },
      ['ok', 'gone', 'refused', 'broken'],
    );

    expect(people.get('ok')).not.toBeNull();
    expect(people.get('gone')).toBeNull();
    expect(people.get('refused')).toBeNull();
    expect(people.get('broken')).toBeNull();
  });

  it('looks each person up once, however often they are listed', async () => {
    const asked: string[] = [];

    await lookupPeople(
      {
        getUser: async (id) => {
          asked.push(id);
          return user(id);
        },
      },
      ['a', 'b', 'a', 'a', 'b'],
    );

    expect(asked.sort()).toEqual(['a', 'b']);
  });

  it('runs at most five lookups at once, and uses the parallelism', async () => {
    let inFlight = 0;
    let peak = 0;
    const ids = Array.from({ length: 23 }, (_, i) => `s${i}`);

    const people = await lookupPeople(
      {
        getUser: async (id) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 1));
          inFlight -= 1;
          return user(id);
        },
      },
      ids,
    );

    expect(PEOPLE_LOOKUP_CONCURRENCY).toBe(5);
    expect(peak).toBe(5);
    expect(people.size).toBe(23);
  });

  it('does nothing for an empty list', async () => {
    const people = await lookupPeople(
      {
        getUser: async () => {
          throw new Error('should not be called');
        },
      },
      [],
    );

    expect(people.size).toBe(0);
  });
});
