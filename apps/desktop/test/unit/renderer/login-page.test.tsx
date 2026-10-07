import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { routes } from '../../../src/renderer/src/router';
import { adminAuth, installFakeApi, renderRoutes, signedOut } from './helpers/render-app';

describe('login page', () => {
  it('moves into the app after a successful sign-in', async () => {
    const api = installFakeApi({ auth: signedOut });
    const { router } = renderRoutes(routes, '/login');

    api.auth.login.mockImplementation(async () => {
      api.auth.status.mockResolvedValue(adminAuth);
      return { ok: true, status: adminAuth };
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/employees'));
  });

  it('shows why a sign-in failed', async () => {
    installFakeApi({
      auth: signedOut,
      login: async () => ({ ok: false, cancelled: false, message: 'Sign-in timed out' }),
    });
    renderRoutes(routes, '/login');

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in timed out');
  });

  it('stays quiet when the user cancels on purpose', async () => {
    installFakeApi({
      auth: signedOut,
      login: async () => ({ ok: false, cancelled: true, message: 'Sign-in was cancelled' }),
    });
    renderRoutes(routes, '/login');

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    await screen.findByRole('button', { name: 'Sign in' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('can cancel while waiting for the browser', async () => {
    const api = installFakeApi({
      auth: signedOut,
      login: () => new Promise(() => undefined),
    });
    renderRoutes(routes, '/login');

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Waiting for you');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.auth.cancelLogin).toHaveBeenCalledOnce();
  });
});
