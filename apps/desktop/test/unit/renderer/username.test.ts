import { describe, expect, it } from 'vitest';
import { suggestUsername } from '../../../src/renderer/src/lib/username';

describe('suggestUsername', () => {
  it('joins the first and last name with a dot, in lowercase', () => {
    expect(suggestUsername('Ann', 'Lee')).toBe('ann.lee');
  });

  it('uses whichever name there is, and nothing when there is neither', () => {
    expect(suggestUsername('Ann', '')).toBe('ann');
    expect(suggestUsername('', 'Lee')).toBe('lee');
    expect(suggestUsername('  ', '')).toBe('');
  });

  it('removes accents and drops characters the identity provider does not accept', () => {
    expect(suggestUsername('José', "O'Brien")).toBe('jose.obrien');
    expect(suggestUsername('Zoë', 'Müller')).toBe('zoe.muller');
  });

  it('turns spaces inside a name into dashes', () => {
    expect(suggestUsername('Mary Ann', 'Van Der Berg')).toBe('mary-ann.van-der-berg');
  });

  it('stays within the 64 character limit', () => {
    expect(suggestUsername('a'.repeat(50), 'b'.repeat(50))).toHaveLength(64);
  });
});
