import { randomInt } from 'node:crypto';

export const TEMPORARY_PASSWORD_LENGTH = 16;

const LOWERCASE = 'abcdefghjkmnpqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALL = `${LOWERCASE}${UPPERCASE}${DIGITS}`;

export type RandomInt = (maxExclusive: number) => number;

const secureRandomInt: RandomInt = (maxExclusive) => randomInt(maxExclusive);

export function generateTemporaryPassword(random: RandomInt = secureRandomInt): string {
  const pick = (alphabet: string): string => alphabet.charAt(random(alphabet.length));
  const characters = [pick(LOWERCASE), pick(UPPERCASE), pick(DIGITS)];
  while (characters.length < TEMPORARY_PASSWORD_LENGTH) characters.push(pick(ALL));

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapWith = random(index + 1);
    const current = characters[index] as string;
    characters[index] = characters[swapWith] as string;
    characters[swapWith] = current;
  }
  return characters.join('');
}
