export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en', { dateStyle: 'medium' });
}

/** A plain calendar date (YYYY-MM-DD) shown as that same day, whatever the time zone. */
export function formatDay(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString('en', { dateStyle: 'medium' });
}

export const START_DATE_NOTE =
  'Information only. The account is created and enabled now. It does not unlock on this date.';

export const START_DATE_NOTE_SAVED =
  'Information only. The account was created and enabled when they were onboarded. It does not unlock on this date.';
