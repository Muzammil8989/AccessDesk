import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { routes } from '../../../src/renderer/src/router';
import { employee, installFakeApi, renderRoutes } from './helpers/render-app';

const ann = employee(1, { firstName: 'Ann', lastName: 'Lee', createdAt: '2026-03-04T10:00:00Z' });

const detail = (overrides: Record<string, unknown> = {}) => ({
  ...ann,
  groups: [
    { id: 'g1', name: 'Engineering', path: '/Engineering' },
    { id: 'g2', name: 'Platform', path: '/Engineering/Platform' },
  ],
  roles: [{ name: 'developer', description: 'Writes code' }],
  ...overrides,
});

const ok = (data: unknown) => ({ ok: true as const, status: 200, data });
const failure = (status: number, message: string) => ({ ok: false as const, status, message });

describe('Employee detail screen', () => {
  it('shows the profile, the groups and the roles', async () => {
    const api = installFakeApi({ apiGet: async () => ok(detail()) });
    renderRoutes(routes, `/employees/${ann.id}`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Ann Lee' })).toHaveFocus();
    expect(api.api.get).toHaveBeenCalledWith(`/employees/${ann.id}`, undefined);

    const profile = screen.getByText('Username').closest('dl')!;
    expect(within(profile).getByText('user1')).toBeInTheDocument();
    expect(within(profile).getByText('user1@example.com')).toBeInTheDocument();
    expect(within(profile).getByText('Verified')).toBeInTheDocument();
    expect(within(profile).getByText('Active')).toBeInTheDocument();
    expect(within(profile).getByText('Mar 4, 2026')).toBeInTheDocument();

    const groups = screen.getByRole('list', { name: 'Groups' });
    expect(
      within(groups)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['/Engineering', '/Engineering/Platform']);
    const roles = screen.getByRole('list', { name: 'Roles' });
    expect(within(roles).getByText('developer')).toBeInTheDocument();
    expect(within(roles).getByText('Writes code')).toBeInTheDocument();
  });

  it('says plainly that only direct roles are shown', async () => {
    installFakeApi({ apiGet: async () => ok(detail()) });
    renderRoutes(routes, `/employees/${ann.id}`);

    expect(
      await screen.findByText(/Roles that come through a group or through another role/),
    ).toBeInTheDocument();
  });

  it('says so when there are no groups and no roles', async () => {
    installFakeApi({ apiGet: async () => ok(detail({ groups: [], roles: [] })) });
    renderRoutes(routes, `/employees/${ann.id}`);

    expect(await screen.findByText('Not in any group.')).toBeInTheDocument();
    expect(screen.getByText('No roles assigned directly.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Groups' })).not.toBeInTheDocument();
  });

  it('uses the username as the title and dashes for what is missing, never "null"', async () => {
    installFakeApi({
      apiGet: async () =>
        ok(
          detail({
            firstName: null,
            lastName: null,
            email: null,
            createdAt: null,
            enabled: false,
          }),
        ),
    });
    renderRoutes(routes, `/employees/${ann.id}`);

    await screen.findByRole('heading', { level: 1, name: 'user1' });
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(document.body).not.toHaveTextContent('null');
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
  });

  it('flags an email that is not verified', async () => {
    installFakeApi({ apiGet: async () => ok(detail({ emailVerified: false })) });
    renderRoutes(routes, `/employees/${ann.id}`);

    expect(await screen.findByText('Not verified')).toBeInTheDocument();
  });

  it('says "not found" for a person the provider does not know', async () => {
    installFakeApi({ apiGet: async () => failure(404, 'User not found') });
    renderRoutes(routes, `/employees/${ann.id}`);

    expect(await screen.findByRole('heading', { name: 'Employee not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /All employees/ })).toHaveAttribute(
      'href',
      '/employees',
    );
  });

  it('says "not found" for an address that is not a person, without asking the API', async () => {
    const api = installFakeApi({ apiGet: async () => ok(detail()) });
    renderRoutes(routes, '/employees/not-a-uuid');

    expect(await screen.findByRole('heading', { name: 'Employee not found' })).toBeInTheDocument();
    expect(api.api.get).not.toHaveBeenCalledWith(expect.stringContaining('not-a-uuid'), undefined);
  });

  it('shows the message and a way to try again when loading fails', async () => {
    let calls = 0;
    installFakeApi({
      apiGet: async () => {
        calls += 1;
        return calls === 1 ? failure(403, 'You do not have access') : ok(detail());
      },
    });
    renderRoutes(routes, `/employees/${ann.id}`);

    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have access');
    expect(screen.queryByRole('heading', { name: 'Profile' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
  });

  it('does not show a person from an answer it cannot read', async () => {
    // An API from before the groups and roles were added.
    installFakeApi({ apiGet: async () => ok(ann) });
    renderRoutes(routes, `/employees/${ann.id}`);

    expect(await screen.findByRole('alert')).toHaveTextContent('does not understand');
    expect(screen.queryByText('Not in any group.')).not.toBeInTheDocument();
  });

  it('is read only: nothing on it changes the person', async () => {
    const api = installFakeApi({ apiGet: async () => ok(detail()) });
    renderRoutes(routes, `/employees/${ann.id}`);
    await screen.findByRole('heading', { name: 'Profile' });

    // The screen is the header and its cards. The only way out is the link back to the list.
    const screenRoot = screen.getByRole('heading', { level: 1 }).closest('header')!.parentElement!;
    expect(within(screenRoot).getByText('Profile')).toBeInTheDocument();
    expect(within(screenRoot).queryAllByRole('button')).toHaveLength(0);
    expect(within(screenRoot).getAllByRole('link')).toHaveLength(1);
    expect(api.api.onboarding.create).not.toHaveBeenCalled();
  });

  describe('from the list', () => {
    const list = {
      ok: true as const,
      status: 200,
      data: { items: [ann], total: 1, first: 0, max: 20 },
    };

    it('opens from a name in the list', async () => {
      installFakeApi({
        apiGet: async (path) => (path === '/employees' ? list : ok(detail())),
      });
      renderRoutes(routes, '/employees');

      await userEvent.click(await screen.findByRole('link', { name: /Ann Lee/ }));

      expect(await screen.findByRole('heading', { level: 1, name: 'Ann Lee' })).toBeInTheDocument();
    });

    it('goes back to the same list, with the same search and filters', async () => {
      installFakeApi({
        apiGet: async (path) => (path === '/employees' ? list : ok(detail())),
      });
      const { router } = renderRoutes(routes, '/employees?status=active&q=ann');

      await userEvent.click(await screen.findByRole('link', { name: /Ann Lee/ }));
      await screen.findByRole('heading', { level: 1, name: 'Ann Lee' });

      const back = screen.getByRole('link', { name: /All employees/ });
      expect(back).toHaveAttribute('href', '/employees?status=active&q=ann');
      await userEvent.click(back);

      await waitFor(() => expect(router.state.location.pathname).toBe('/employees'));
      expect(router.state.location.search).toBe('?status=active&q=ann');
      expect(await screen.findByRole('searchbox', { name: 'Search employees' })).toHaveValue('ann');
    });
  });
});
