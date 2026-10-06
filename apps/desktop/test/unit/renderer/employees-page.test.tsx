import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { routes } from '../../../src/renderer/src/router';
import { adminAuth, employee, installFakeApi, renderRoutes, signedOut } from './helpers/render-app';

const page = (items: unknown[], total = items.length, first = 0) => ({
  ok: true as const,
  status: 200,
  data: { items, total, first, max: 20 },
});

describe('Employees screen', () => {
  it('lists employees from the API', async () => {
    const api = installFakeApi({
      auth: adminAuth,
      apiGet: async () => page([employee(1), employee(2, { enabled: false })]),
    });
    renderRoutes(routes, '/employees');

    await screen.findByText('user1@example.com');
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('Active')).toHaveLength(1);
    expect(within(table).getAllByText('Disabled')).toHaveLength(1);
    expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument();
    expect(api.api.get).toHaveBeenCalledWith('/employees', { first: 0, max: 20 });
  });

  it('shows a dash for missing names and emails instead of "null"', async () => {
    installFakeApi({
      apiGet: async () => page([employee(1, { firstName: null, lastName: null, email: null })]),
    });
    renderRoutes(routes, '/employees');

    const row = (await screen.findByText('user1')).closest('tr')!;
    expect(within(row).getAllByText('—')).toHaveLength(2);
    expect(row).not.toHaveTextContent('null');
  });

  it('pages forward with the right offset and disables Next on the last page', async () => {
    const api = installFakeApi({
      apiGet: async (_path, query) =>
        query?.first === 20 ? page([employee(21)], 21, 20) : page([employee(1)], 21, 0),
    });
    renderRoutes(routes, '/employees');

    await screen.findByText('Showing 1–20 of 21');
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /Next/ }));

    await screen.findByText('Showing 21–21 of 21');
    expect(api.api.get).toHaveBeenLastCalledWith('/employees', { first: 20, max: 20 });
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });

  it('searches after typing stops, and goes back to the first page', async () => {
    const api = installFakeApi({ apiGet: async () => page([employee(1)]) });
    renderRoutes(routes, '/employees');
    await screen.findByRole('table');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search employees' }), 'ann');

    await waitFor(() =>
      expect(api.api.get).toHaveBeenLastCalledWith('/employees', {
        search: 'ann',
        first: 0,
        max: 20,
      }),
    );
    // Debounced: one request for "ann", not one per keystroke.
    const searchCalls = api.api.get.mock.calls.filter(([, q]) => q?.search !== undefined);
    expect(searchCalls).toHaveLength(1);
  });

  it('explains an empty search result', async () => {
    installFakeApi({ apiGet: async () => page([]) });
    renderRoutes(routes, '/employees');

    await userEvent.type(await screen.findByRole('searchbox'), 'zzz');
    expect(await screen.findByText('No employees match “zzz”.')).toBeInTheDocument();
  });

  it('shows the server message and a link to Settings on a 403', async () => {
    installFakeApi({
      apiGet: async () => ({ ok: false, status: 403, message: 'Keycloak refused this request' }),
    });
    renderRoutes(routes, '/employees');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load employees');
    expect(alert).toHaveTextContent('Keycloak refused this request');
    expect(within(alert).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('retries on demand', async () => {
    let calls = 0;
    installFakeApi({
      apiGet: async () => {
        calls += 1;
        return calls === 1
          ? { ok: false, status: 429, message: 'Too many requests, wait a moment' }
          : page([employee(1)]);
      },
    });
    renderRoutes(routes, '/employees');

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('does not trust a response that does not match the shared schema', async () => {
    installFakeApi({
      apiGet: async () => ({ ok: true, status: 200, data: { items: [{ id: 1 }], total: 'many' } }),
    });
    renderRoutes(routes, '/employees');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load employees');
    expect(alert).toHaveTextContent('does not understand');
    expect(alert).not.toHaveTextContent(/expected|invalid_type|ZodError/i);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('returns to the login page when the session has ended (401)', async () => {
    // The main process reports the session as gone at the moment the API answers 401.
    const api = installFakeApi({
      auth: adminAuth,
      apiGet: async () => {
        api.auth.status.mockResolvedValue(signedOut);
        return { ok: false, status: 401, message: 'You are not signed in' };
      },
    });
    const { router } = renderRoutes(routes, '/employees');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('retries a server fault by itself, but not a client error', async () => {
    const serverFault = installFakeApi({
      apiGet: async () => ({ ok: false, status: 503, message: 'Keycloak is down' }),
    });
    const first = renderRoutes(routes, '/employees');
    await waitFor(() => expect(serverFault.api.get.mock.calls.length).toBeGreaterThan(1), {
      timeout: 4000,
    });
    first.unmount();

    const clientError = installFakeApi({
      apiGet: async () => ({ ok: false, status: 400, message: 'Bad request' }),
    });
    renderRoutes(routes, '/employees');
    await screen.findByRole('alert');
    expect(clientError.api.get).toHaveBeenCalledTimes(1);
  }, 10_000);
});
