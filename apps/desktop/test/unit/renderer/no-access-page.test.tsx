import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { routes } from '../../../src/renderer/src/router';
import { installFakeApi, memberAuth, renderRoutes } from './helpers/render-app';

describe('no-access page', () => {
  it('tells the user who they are and which roles their sign-in has', async () => {
    installFakeApi({ auth: memberAuth });
    renderRoutes(routes, '/no-access');

    await screen.findByText(/Member One/);
    expect(screen.getByText('offline_access')).toBeInTheDocument();
    expect(screen.getByText('default-roles-company-platform')).toBeInTheDocument();
    expect(screen.getByText('hr-admin')).toBeInTheDocument(); // named as what they need
  });

  it('says so when the token carries no roles at all', async () => {
    installFakeApi({ auth: { ...memberAuth, roles: [] } });
    renderRoutes(routes, '/no-access');

    await screen.findByText('none');
  });

  it('lets them sign out, which returns them to the login page', async () => {
    const api = installFakeApi({ auth: memberAuth });
    const { router } = renderRoutes(routes, '/no-access');

    await userEvent.click(await screen.findByRole('button', { name: /Sign out/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(api.auth.logout).toHaveBeenCalledOnce();
  });

  it('offers a way to fix a wrong connection setting', async () => {
    installFakeApi({ auth: memberAuth });
    renderRoutes(routes, '/no-access');

    expect(await screen.findByRole('link', { name: 'Change connection settings' })).toHaveAttribute(
      'href',
      '/setup',
    );
  });
});
