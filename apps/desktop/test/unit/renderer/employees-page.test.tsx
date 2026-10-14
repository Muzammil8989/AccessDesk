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
  it('offers a way to onboard someone, from the header and from the empty list', async () => {
    installFakeApi({ auth: adminAuth, apiGet: async () => page([]) });
    renderRoutes(routes, '/employees');

    await screen.findByText('No employees found.');
    const links = screen.getAllByRole('link', { name: 'Onboard employee' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute('href', '/onboard');
  });

  it('says how many people there are, in the header', async () => {
    installFakeApi({ apiGet: async () => page([employee(1)], 41) });
    renderRoutes(routes, '/employees');

    expect(await screen.findByText(/41 people in total\./)).toBeInTheDocument();
  });

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
    const searchCalls = api.api.get.mock.calls.filter(([, q]) => q?.search !== undefined);
    expect(searchCalls).toHaveLength(1);
  });

  it('explains an empty search result', async () => {
    installFakeApi({ apiGet: async () => page([]) });
    renderRoutes(routes, '/employees');

    await userEvent.type(await screen.findByRole('searchbox'), 'zzz');
    expect(await screen.findByText('No employees match “zzz”.')).toBeInTheDocument();
  });

  it('offers a way out of a search that matches nobody', async () => {
    installFakeApi({ apiGet: async () => page([]) });
    renderRoutes(routes, '/employees');

    const box = await screen.findByRole('searchbox', { name: 'Search employees' });
    await userEvent.type(box, 'zzz');
    await userEvent.click(await screen.findByRole('button', { name: 'Clear search' }));

    expect(box).toHaveValue('');
    expect(await screen.findByText('No employees found.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  it('says where you are when there is more than one page', async () => {
    installFakeApi({ apiGet: async () => page([employee(1)], 41, 0) });
    renderRoutes(routes, '/employees');

    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('does not show a page count when everything fits on one page', async () => {
    installFakeApi({ apiGet: async () => page([employee(1)]) });
    renderRoutes(routes, '/employees');

    await screen.findByText('Showing 1–1 of 1');
    expect(screen.queryByText(/^Page \d+ of \d+$/)).not.toBeInTheDocument();
  });

  it('marks status with an icon as well as colour, and falls back to the username for the avatar', async () => {
    installFakeApi({
      apiGet: async () =>
        page([employee(1), employee(2, { enabled: false, firstName: null, lastName: null })]),
    });
    renderRoutes(routes, '/employees');

    const table = await screen.findByRole('table');
    await within(table).findByText('Active');
    expect(within(table).getByText('Active').querySelector('svg')).not.toBeNull();
    expect(within(table).getByText('Disabled').querySelector('svg')).not.toBeNull();
    expect(within(table).getByText('U1')).toBeInTheDocument();
    expect(within(table).getByText('US')).toBeInTheDocument();
  });

  it('shows the server message and a link to Settings on a 403', async () => {
    installFakeApi({
      apiGet: async () => ({
        ok: false,
        status: 403,
        message: 'The identity provider refused this request',
      }),
    });
    renderRoutes(routes, '/employees');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load employees');
    expect(alert).toHaveTextContent('The identity provider refused this request');
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
      apiGet: async () => ({ ok: false, status: 503, message: 'The identity provider is down' }),
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
    const listCalls = clientError.api.get.mock.calls.filter(([path]) => path === '/employees');
    expect(listCalls).toHaveLength(1);
  }, 10_000);
});

describe('Employees filters', () => {
  const listCalls = (api: ReturnType<typeof installFakeApi>) =>
    api.api.get.mock.calls.filter(([path]) => path === '/employees');
  const lastListQuery = (api: ReturnType<typeof installFakeApi>) => listCalls(api).at(-1)?.[1];
  const chooseStatus = (name: 'All' | 'Active' | 'Disabled') =>
    userEvent.click(screen.getByRole('radio', { name }));

  it('offers labelled controls for status, group and role', async () => {
    installFakeApi({ apiGet: async () => page([employee(1)]) });
    renderRoutes(routes, '/employees');

    const status = await screen.findByRole('radiogroup', { name: 'Status' });
    const group = screen.getByLabelText('Group');
    const role = screen.getByLabelText('Role');

    for (const control of [group, role]) expect(control.tagName).toBe('SELECT');
    expect(
      within(status)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['All', 'Active', 'Disabled']);
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    await waitFor(() => expect(group).toBeEnabled());
    expect(
      within(group)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Any group', 'Engineering', 'Sales']);
    expect(
      within(role)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Any role', 'developer', 'manager']);
  });

  it('describes what the group and role lists include, for screen readers', async () => {
    installFakeApi({ apiGet: async () => page([employee(1)]) });
    renderRoutes(routes, '/employees');

    await screen.findByRole('radiogroup', { name: 'Status' });
    expect(screen.getByLabelText('Group')).toHaveAccessibleDescription(
      'Direct members only; people in subgroups are not included.',
    );
    expect(screen.getByLabelText('Role')).toHaveAccessibleDescription(
      'Only people who hold this role directly are shown.',
    );
  });

  it('sends enabled=false for Disabled, together with the search text', async () => {
    const api = installFakeApi({ apiGet: async () => page([employee(1)]) });
    renderRoutes(routes, '/employees');
    await screen.findByRole('table');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search employees' }), 'ann');
    await chooseStatus('Disabled');

    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({ search: 'ann', enabled: 'false', first: 0, max: 20 }),
    );
    await chooseStatus('Active');
    await waitFor(() => expect(lastListQuery(api)).toMatchObject({ enabled: 'true' }));
    await chooseStatus('All');
    await waitFor(() => expect(lastListQuery(api)).not.toHaveProperty('enabled'));
  });

  it('filters by group, which switches the role filter off with a reason', async () => {
    const api = installFakeApi({ apiGet: async () => page([employee(1)]) });
    renderRoutes(routes, '/employees');
    const group = await screen.findByLabelText('Group');
    await waitFor(() => expect(group).toBeEnabled());

    await userEvent.selectOptions(group, 'Engineering');
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({ groupId: 'group-eng', first: 0, max: 20 }),
    );

    const role = screen.getByLabelText('Role');
    expect(role).toBeDisabled();
    expect(role).toHaveAccessibleDescription('Clear the group filter to filter by role.');
    expect(within(role).getByRole('option', { name: 'Not available with a group' })).toBeVisible();
    expect(screen.getByText(/A group and a role cannot be combined/)).toBeInTheDocument();
  });

  it('filters by role after the group is cleared, and the group is then off', async () => {
    const api = installFakeApi({ apiGet: async () => page([employee(1)]) });
    renderRoutes(routes, '/employees?group=group-eng');
    const group = await screen.findByLabelText('Group');
    await waitFor(() => expect(group).toBeEnabled());

    await userEvent.selectOptions(group, 'Any group');
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'developer');

    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({ role: 'developer', first: 0, max: 20 }),
    );
    expect(screen.getByLabelText('Group')).toBeDisabled();
    expect(screen.getByLabelText('Role')).toHaveValue('developer');
  });

  it('lists the applied filters as chips, and each chip removes only its own filter', async () => {
    const api = installFakeApi({ apiGet: async () => page([employee(1)]) });
    renderRoutes(routes, '/employees?status=disabled&group=group-sales');

    const chips = await screen.findByRole('list', { name: 'Applied filters' });
    await within(chips).findByText('Group: Sales');
    expect(
      within(chips)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Status: Disabled', 'Group: Sales']);

    await userEvent.click(
      within(chips).getByRole('button', { name: 'Remove filter Status: Disabled' }),
    );

    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({ groupId: 'group-sales', first: 0, max: 20 }),
    );
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(screen.getByRole('list', { name: 'Applied filters' })).not.toHaveTextContent('Status');
  });

  it('shows no chips while nothing is filtered', async () => {
    installFakeApi({ apiGet: async () => page([employee(1)]) });
    renderRoutes(routes, '/employees');
    await screen.findByRole('table');

    expect(screen.queryByRole('list', { name: 'Applied filters' })).not.toBeInTheDocument();
  });

  it('goes back to the first page whenever a filter changes', async () => {
    const api = installFakeApi({
      apiGet: async (_path, query) =>
        query?.first === 20 ? page([employee(21)], 41, 20) : page([employee(1)], 41, 0),
    });
    renderRoutes(routes, '/employees');
    await screen.findByText('Showing 1–20 of 41');
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    await screen.findByText('Showing 21–40 of 41');

    await chooseStatus('Active');

    await waitFor(() => expect(lastListQuery(api)).toMatchObject({ enabled: 'true', first: 0 }));
    await screen.findByText('Showing 1–20 of 41');
  });

  it('announces the count politely, and says so when nothing matches', async () => {
    installFakeApi({
      apiGet: async (_path, query) =>
        query?.enabled === 'false' ? page([]) : page([employee(1), employee(2)]),
    });
    renderRoutes(routes, '/employees');

    const status = await screen.findByText('Showing 1–2 of 2');
    expect(status).toHaveAttribute('role', 'status');

    await chooseStatus('Disabled');

    await waitFor(() => expect(status).toHaveTextContent('0 results'));
    expect(screen.getByRole('status')).toBe(status);
  });

  it('keeps focus on the control that was changed while the list reloads', async () => {
    installFakeApi({ apiGet: async () => page([employee(1)]) });
    renderRoutes(routes, '/employees');
    const disabled = await screen.findByRole('radio', { name: 'Disabled' });
    await screen.findByRole('table');

    await userEvent.click(disabled);
    await waitFor(() => expect(disabled).toBeChecked());
    await screen.findByText('Showing 1–1 of 1');

    expect(disabled).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Disabled' })).toBe(disabled);
  });

  it('reaches every filter from the keyboard, in reading order', async () => {
    installFakeApi({ apiGet: async () => page([employee(1)]) });
    renderRoutes(routes, '/employees');
    await screen.findByRole('table');
    await waitFor(() => expect(screen.getByLabelText('Group')).toBeEnabled());

    await userEvent.click(screen.getByRole('searchbox', { name: 'Search employees' }));
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'All' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText('Group')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText('Role')).toHaveFocus();
  });

  it('explains an empty result for filters and clears them all in one step', async () => {
    const api = installFakeApi({
      apiGet: async (_path, query) => (query?.enabled ? page([]) : page([employee(1)])),
    });
    renderRoutes(routes, '/employees');
    await screen.findByRole('table');

    await chooseStatus('Disabled');

    expect(await screen.findByText('No employees match these filters.')).toBeInTheDocument();
    expect(screen.getByText('Try a different status, group or role.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));

    await screen.findByText('user1@example.com');
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(lastListQuery(api)).toEqual({ first: 0, max: 20 });
  });

  it('mentions the search text in the empty message when both are set', async () => {
    installFakeApi({ apiGet: async () => page([]) });
    renderRoutes(routes, '/employees');

    await userEvent.type(await screen.findByRole('searchbox'), 'zzz');
    await chooseStatus('Active');

    expect(
      await screen.findByText('Nobody matches “zzz” with the chosen filters.'),
    ).toBeInTheDocument();
  });

  it('warns that a group list is incomplete when the member cap was reached', async () => {
    installFakeApi({
      apiGet: async () => ({
        ok: true as const,
        status: 200,
        data: { items: [employee(1)], total: 2000, capped: true, first: 0, max: 20 },
      }),
    });
    renderRoutes(routes, '/employees?group=group-eng');

    expect(await screen.findByText('This list may be incomplete')).toBeInTheDocument();
    expect(
      screen.getByText(/This group has more people than AccessDesk can read at once/),
    ).toBeInTheDocument();
    expect(screen.getByText('Showing 1–20 of at least 2000')).toBeInTheDocument();
  });

  it('words the incomplete-list warning for a role', async () => {
    installFakeApi({
      apiGet: async () => ({
        ok: true as const,
        status: 200,
        data: { items: [employee(1)], total: 5, capped: true, first: 0, max: 20 },
      }),
    });
    renderRoutes(routes, '/employees?role=developer');

    expect(
      await screen.findByText(/This role has more people than AccessDesk can read/),
    ).toBeInTheDocument();
  });

  it('does not warn when the list is complete', async () => {
    installFakeApi({ apiGet: async () => page([employee(1)]) });
    renderRoutes(routes, '/employees?group=group-eng');

    await screen.findByText('Showing 1–1 of 1');
    expect(screen.queryByText('This list may be incomplete')).not.toBeInTheDocument();
  });

  it('restores filters, search and page from the address', async () => {
    const api = installFakeApi({ apiGet: async () => page([employee(21)], 41, 20) });
    renderRoutes(routes, '/employees?status=disabled&role=manager&q=ann&page=1');

    await screen.findByText('Showing 21–40 of 41');
    expect(lastListQuery(api)).toEqual({
      search: 'ann',
      enabled: 'false',
      role: 'manager',
      first: 20,
      max: 20,
    });
    expect(screen.getByRole('radio', { name: 'Disabled' })).toBeChecked();
    expect(screen.getByLabelText('Role')).toHaveValue('manager');
    expect(screen.getByRole('searchbox', { name: 'Search employees' })).toHaveValue('ann');
  });

  it('keeps the filters in the address as they change', async () => {
    installFakeApi({ apiGet: async () => page([employee(1)]) });
    const { router } = renderRoutes(routes, '/employees');
    await screen.findByRole('table');

    await chooseStatus('Active');
    await userEvent.type(screen.getByRole('searchbox'), 'ann');

    await waitFor(() => expect(router.state.location.search).toBe('?status=active&q=ann'));
    await chooseStatus('All');
    await waitFor(() => expect(router.state.location.search).toBe('?q=ann'));
  });

  it('ignores an unknown status in the address', async () => {
    const api = installFakeApi({ apiGet: async () => page([employee(1)]) });
    renderRoutes(routes, '/employees?status=bogus&page=-3');

    await screen.findByRole('table');
    expect(lastListQuery(api)).toEqual({ first: 0, max: 20 });
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
  });

  it('returns to the first page when the saved page no longer exists', async () => {
    const api = installFakeApi({
      apiGet: async (_path, query) =>
        query?.first === 0 ? page([employee(1)], 3) : page([], 3, 100),
    });
    renderRoutes(routes, '/employees?page=5');

    await screen.findByText('user1@example.com');
    expect(lastListQuery(api)).toEqual({ first: 0, max: 20 });
  });

  it('still lists everyone, and keeps Status working, when the group and role lists fail', async () => {
    const api = installFakeApi({
      apiGet: async () => page([employee(1)]),
      filterOptions: {
        ok: false,
        status: 403,
        message: 'The identity provider refused this request',
      },
    });
    renderRoutes(routes, '/employees');

    expect(
      await screen.findByText('Group and role filters could not be loaded'),
    ).toBeInTheDocument();
    expect(await screen.findByText('user1@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText('Group')).toBeDisabled();
    expect(screen.getByLabelText('Role')).toBeDisabled();

    await chooseStatus('Active');
    await waitFor(() => expect(lastListQuery(api)).toMatchObject({ enabled: 'true' }));
  });

  it('retries only the filter lists from their own button', async () => {
    const api = installFakeApi({
      apiGet: async () => page([employee(1)]),
      filterOptions: { ok: false, status: 400, message: 'Nope' },
    });
    renderRoutes(routes, '/employees');
    const alert = (await screen.findByText('Group and role filters could not be loaded')).closest(
      'div',
    )!;
    const before = listCalls(api).length;

    await userEvent.click(within(alert.parentElement!).getByRole('button', { name: 'Try again' }));

    await waitFor(() =>
      expect(
        api.api.get.mock.calls.filter(([p]) => p === '/employees/filter-options').length,
      ).toBeGreaterThan(1),
    );
    expect(listCalls(api).length).toBe(before);
  });

  it('offers to clear the filters when loading the list fails with them set', async () => {
    const api = installFakeApi({
      apiGet: async (_path, query) =>
        query?.groupId
          ? {
              ok: false,
              status: 400,
              message: 'That group does not exist, or it is not a top-level group',
            }
          : page([employee(1)]),
    });
    renderRoutes(routes, '/employees?group=gone');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('That group does not exist');
    await userEvent.click(within(alert).getByRole('button', { name: 'Clear filters' }));

    expect(await screen.findByText('user1@example.com')).toBeInTheDocument();
    expect(lastListQuery(api)).toEqual({ first: 0, max: 20 });
  });

  it('has no Clear filters button until a filter is set', async () => {
    installFakeApi({ apiGet: async () => page([employee(1)]) });
    renderRoutes(routes, '/employees');
    await screen.findByRole('table');

    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
    await chooseStatus('Active');
    await userEvent.click(await screen.findByRole('button', { name: 'Clear filters' }));

    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });
});
