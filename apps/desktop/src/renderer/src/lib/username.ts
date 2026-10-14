const DISALLOWED = /[^a-z0-9._-]/g;

function part(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(DISALLOWED, '');
}

/**
 * A username to start from: `first.last`, lowercase, with accents removed and anything the
 * identity provider does not accept dropped. It is a suggestion; the admin can change it.
 */
export function suggestUsername(firstName: string, lastName: string): string {
  return [part(firstName), part(lastName)].filter(Boolean).join('.').slice(0, 64);
}
