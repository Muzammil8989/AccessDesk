import { describe, expect, it } from 'vitest';
import { IdentityProviderError } from '../../src/index';

describe('IdentityProviderError', () => {
  it('carries the HTTP-style status and is a regular Error', () => {
    const error = new IdentityProviderError(404, 'User not found');
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(404);
    expect(error.message).toBe('User not found');
    expect(error.name).toBe('IdentityProviderError');
  });
});
