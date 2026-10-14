import { describe, expect, it } from 'vitest';
import { cn } from '../../../src/renderer/src/lib/utils';

describe('cn with the M3 type scale', () => {
  it('keeps a type-scale size and a text colour together', () => {
    expect(cn('text-body-medium', 'text-on-surface-variant')).toBe(
      'text-body-medium text-on-surface-variant',
    );
  });

  it('lets a later type-scale size replace an earlier one', () => {
    expect(cn('text-body-medium', 'text-title-medium')).toBe('text-title-medium');
    expect(cn('text-sm', 'text-label-large')).toBe('text-label-large');
  });

  it('keeps an elevation shadow and lets a later one replace it', () => {
    expect(cn('shadow-elevation-1', 'shadow-elevation-3')).toBe('shadow-elevation-3');
  });
});
