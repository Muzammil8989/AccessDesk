import { describe, expect, it } from 'vitest';
import {
  TEMPORARY_PASSWORD_LENGTH,
  generateTemporaryPassword,
} from '../../src/modules/onboarding/temporary-password';

const AMBIGUOUS = /[0O1lIio]/;

describe('generateTemporaryPassword', () => {
  it('makes 16 characters with a lowercase letter, an uppercase letter and a digit', () => {
    for (let run = 0; run < 500; run += 1) {
      const password = generateTemporaryPassword();

      expect(password).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it('never uses a character that is easy to mistake for another', () => {
    for (let run = 0; run < 500; run += 1) {
      expect(generateTemporaryPassword()).not.toMatch(AMBIGUOUS);
    }
  });

  it('gives a different password each time', () => {
    const passwords = new Set(Array.from({ length: 200 }, () => generateTemporaryPassword()));

    expect(passwords.size).toBe(200);
  });

  it('draws every character from the random source it is given', () => {
    const asked: number[] = [];
    const random = (maxExclusive: number) => {
      asked.push(maxExclusive);
      return 0;
    };

    const password = generateTemporaryPassword(random);

    expect(password).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
    expect(asked.every((max) => max >= 1)).toBe(true);
    expect(asked.length).toBeGreaterThan(TEMPORARY_PASSWORD_LENGTH);
  });

  it('keeps the class guarantees whatever the random source returns', () => {
    const highest = (maxExclusive: number) => maxExclusive - 1;

    const password = generateTemporaryPassword(highest);

    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[0-9]/);
  });
});
