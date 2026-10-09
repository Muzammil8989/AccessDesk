import { describe, expect, it } from 'vitest';
import { templateSchema, type Template } from '../../src/index';

type Item = Template['items'][number];

const item = (kind: Item['kind'], targetRef: string | null): Item => ({
  id: 'i',
  title: 't',
  description: null,
  kind,
  targetRef,
  position: 0,
});

describe('templateSchema', () => {
  const valid = {
    id: 't1',
    name: 'Developer',
    description: null,
    departmentRef: '/Engineering',
    defaultRole: 'member',
    items: [
      item('GROUP_MEMBERSHIP', '/Sales'),
      item('ROLE', 'developer'),
      item('MANUAL_TASK', null),
    ],
  };

  it('accepts the three item kinds and a default role', () => {
    expect(templateSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    { defaultRole: 'owner' },
    { defaultRole: 'developer' },
    { items: [{ ...item('ROLE', 'x'), kind: 'REALM_ROLE' }] },
  ])('rejects %j', (override) => {
    expect(templateSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});
