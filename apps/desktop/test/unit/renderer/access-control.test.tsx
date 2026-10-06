import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { routes } from '../../../src/renderer/src/router';
import {
  adminAuth,
  installFakeApi,
  memberAuth,
  renderRoutes,
  signedOut,
} from './helpers/render-app';

describe('who sees what', () => {
  it('shows an admin the whole menu', async () => {
    installFakeApi({ auth: adminAuth });
    renderRoutes(routes, '/onboard');

    await screen.findByRole('heading', { name: 'Onboard' });
    const menu = screen.getByRole('navigation', { name: 'Main' });
    const labels = Array.from(menu.querySelectorAll('a')).map((a) => a.textContent);
    expect(labels).toEqual([
      'Employees',
      'Onboard',
      'Offboard',
      'Access Review',
      'Audit Log',
      'Settings',
    ]);
  });

  it.each(['/employees', '/settings', '/onboard', '/'])(
    'sends a user without an admin role from %s to the no-access page, with no menu',
    async (path) => {
      const api = installFakeApi({ auth: memberAuth });
      const { router } = renderRoutes(routes, path);

      await screen.findByRole('heading', { name: "You don't have access to AccessDesk" });
      expect(router.state.location.pathname).toBe('/no-access');
      expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Employees' })).not.toBeInTheDocument();
      expect(api.api.get).not.toHaveBeenCalled();
    },
  );

  it('sends a signed-out user to the login page', async () => {
    installFakeApi({ auth: signedOut });
    const { router } = renderRoutes(routes, '/employees');

    await screen.findByRole('button', { name: 'Sign in with Keycloak' });
    expect(router.state.location.pathname).toBe('/login');
  });

  it('sends everyone to the setup wizard until Keycloak is configured', async () => {
    installFakeApi({ settings: null, auth: signedOut });
    const { router } = renderRoutes(routes, '/employees');

    await screen.findByText('Welcome to AccessDesk');
    expect(router.state.location.pathname).toBe('/setup');
  });

  it('sends an admin who opens the no-access page back to the app', async () => {
    installFakeApi({ auth: adminAuth, apiGet: async () => ({ ok: true, status: 200, data: {} }) });
    const { router } = renderRoutes(routes, '/no-access');

    await screen.findByRole('navigation', { name: 'Main' });
    expect(router.state.location.pathname).toBe('/employees');
  });

  it('falls back to the app for unknown URLs', async () => {
    installFakeApi({ auth: adminAuth });
    const { router } = renderRoutes(routes, '/does-not-exist');

    await screen.findByRole('navigation', { name: 'Main' });
    expect(router.state.location.pathname).toBe('/employees');
  });
});
