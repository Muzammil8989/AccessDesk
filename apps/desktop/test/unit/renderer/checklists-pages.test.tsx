import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { routes } from '../../../src/renderer/src/router';
import type { ApiResponse } from '../../../src/shared/ipc';
import {
  adminAuth,
  installFakeApi,
  memberAuth,
  renderRoutes,
  signedOut,
} from './helpers/render-app';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const ok = (data: unknown): ApiResponse => ({ ok: true, status: 200, data });
const fail = (status: number, message: string): ApiResponse => ({ ok: false, status, message });

const summary = (n: number, overrides: Record<string, unknown> = {}) => ({
  subjectId: id(n),
  status: 'open',
  createdAt: '2026-10-05T12:00:00.000Z',
  completedAt: null,
  totalCount: 3,
  doneCount: 1,
  person: { displayName: `Person ${n}`, username: `person${n}` },
  manager: null,
  startDate: null,
  ...overrides,
});

const list = (items: unknown[], total = items.length, first = 0) =>
  ok({ items, total, first, max: 20 });

describe('Open checklists screen', () => {
  it('lists each checklist with the person, the progress and the start date, and links to it', async () => {
    const api = installFakeApi({
      auth: adminAuth,
      apiGet: async () =>
        list([
          summary(1, {
            manager: { subjectId: id(50), person: { displayName: 'Bea Boss', username: 'boss' } },
            startDate: '2026-10-20',
          }),
        ]),
    });
    renderRoutes(routes, '/onboard/checklists');

    await screen.findByText('Person 1');
    const table = screen.getByRole('table');

    expect(within(table).getByText('Person 1')).toBeInTheDocument();
    expect(within(table).getByText('person1')).toBeInTheDocument();
    expect(within(table).getByText('1 of 3 tasks done')).toBeInTheDocument();
    expect(within(table).getByText('Bea Boss')).toBeInTheDocument();
    expect(within(table).getByText('Oct 20, 2026')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the checklist for Person 1' })).toHaveAttribute(
      'href',
      `/onboard/checklists/${id(1)}`,
    );
    expect(api.api.get).toHaveBeenCalledWith('/checklists', { status: 'open', first: 0, max: 20 });
  });

  it('says "Unknown person" for someone the identity provider no longer has, instead of showing nothing', async () => {
    installFakeApi({ apiGet: async () => list([summary(1, { person: null })]) });
    renderRoutes(routes, '/onboard/checklists');

    const row = (await screen.findByText('Unknown person')).closest('tr')!;

    expect(within(row).getByText('Not found in the identity provider')).toBeInTheDocument();
    expect(
      within(row).getByRole('link', { name: 'Open the checklist for Unknown person' }),
    ).toBeInTheDocument();
  });

  it('moves keyboard focus to the page heading when it opens', async () => {
    installFakeApi({ apiGet: async () => list([summary(1)]) });
    renderRoutes(routes, '/onboard/checklists');

    const heading = await screen.findByRole('heading', { level: 1, name: 'Onboarding checklists' });

    expect(heading).toHaveFocus();
  });

  it('gives the filter choices and the Open links a target of at least 40px, and the status badge an icon', async () => {
    installFakeApi({
      apiGet: async (_path, query) =>
        query?.status === 'done'
          ? list([summary(2, { status: 'done', doneCount: 3 })])
          : list([summary(1)]),
    });
    renderRoutes(routes, '/onboard/checklists');
    await screen.findByText('Person 1');

    const radioLabel = screen.getByRole('radio', { name: 'Open' }).closest('label')!;
    expect(radioLabel).toHaveClass('min-h-10');
    const open = screen.getByRole('link', { name: 'Open the checklist for Person 1' });
    expect(open).toHaveClass('h-10');

    await userEvent.click(screen.getByRole('radio', { name: 'Done' }));
    const badge = await screen.findByText('All tasks done');
    expect(badge.querySelector('svg')).not.toBeNull();
  });

  it('explains a list with the wrong shape in plain words, never raw validation output', async () => {
    installFakeApi({ apiGet: async () => ok({ items: 'nope', total: 'many' }) });
    renderRoutes(routes, '/onboard/checklists');

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent(
      'The server sent a response this version of the app does not understand.',
    );
    expect(document.body).not.toHaveTextContent(/invalid_type|expected|zod/i);
  });

  it('keeps a checklist that has only a manager or a start date in the Open list, saying "No tasks"', async () => {
    installFakeApi({
      apiGet: async () =>
        list([summary(1, { totalCount: 0, doneCount: 0, startDate: '2026-10-20' })]),
    });
    renderRoutes(routes, '/onboard/checklists');

    const row = (await screen.findByText('Person 1')).closest('tr')!;

    expect(within(row).getByText('No tasks')).toBeInTheDocument();
    expect(within(row).getByText('Oct 20, 2026')).toBeInTheDocument();
    expect(within(row).queryByText(/All tasks done/)).not.toBeInTheDocument();
  });

  it('shows a closed checklist without tasks as "Marked as done" in the Done list, with its start date', async () => {
    installFakeApi({
      apiGet: async (_path, query) =>
        query?.status === 'done'
          ? list([
              summary(2, {
                status: 'done',
                totalCount: 0,
                doneCount: 0,
                startDate: '2026-10-20',
                manager: { subjectId: id(50), person: null },
              }),
            ])
          : list([]),
    });
    renderRoutes(routes, '/onboard/checklists');
    await userEvent.click(await screen.findByRole('radio', { name: 'Done' }));

    const row = (await screen.findByText('Person 2')).closest('tr')!;

    expect(within(row).getByText('Marked as done').querySelector('svg')).not.toBeNull();
    expect(within(row).getByText('Oct 20, 2026')).toBeInTheDocument();
    expect(within(row).getByText('Unknown person')).toBeInTheDocument();
  });

  it('shows a dash when there is no manager or start date, and says start dates are information only', async () => {
    installFakeApi({ apiGet: async () => list([summary(1)]) });
    renderRoutes(routes, '/onboard/checklists');

    const row = (await screen.findByText('Person 1')).closest('tr')!;

    expect(within(row).getAllByText('—')).toHaveLength(2);
    expect(screen.getByText(/Start dates are for information only/)).toBeInTheDocument();
  });

  it('has a link back to Onboard', async () => {
    installFakeApi({ apiGet: async () => list([]) });
    const { router } = renderRoutes(routes, '/onboard/checklists');

    await userEvent.click(await screen.findByRole('link', { name: 'Back to Onboard' }));

    expect(router.state.location.pathname).toBe('/onboard');
  });

  it('filters with a radio group that works with the arrow keys, and goes back to the first page', async () => {
    const api = installFakeApi({
      apiGet: async (_path, query) =>
        query?.status === 'done'
          ? list([
              summary(2, { status: 'done', doneCount: 3, completedAt: '2026-10-06T12:00:00.000Z' }),
            ])
          : list([summary(1)]),
    });
    renderRoutes(routes, '/onboard/checklists');
    await screen.findByText('Person 1');
    const group = screen.getByRole('group', { name: 'Show' });
    const open = within(group).getByRole('radio', { name: 'Open' });
    expect(open).toBeChecked();

    open.focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(within(group).getByRole('radio', { name: 'Done' })).toBeChecked();
    expect(await screen.findByText('Person 2')).toBeInTheDocument();
    expect(screen.getByText('All tasks done')).toBeInTheDocument();
    expect(api.api.get).toHaveBeenLastCalledWith('/checklists', {
      status: 'done',
      first: 0,
      max: 20,
    });
  });

  it('pages forward with the right offset and disables Next on the last page', async () => {
    const api = installFakeApi({
      apiGet: async (_path, query) =>
        query?.first === 20 ? list([summary(21)], 21, 20) : list([summary(1)], 21, 0),
    });
    renderRoutes(routes, '/onboard/checklists');
    await screen.findByText('Showing 1–20 of 21');
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /Next/ }));

    await screen.findByText('Showing 21–21 of 21');
    expect(api.api.get).toHaveBeenLastCalledWith('/checklists', {
      status: 'open',
      first: 20,
      max: 20,
    });
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });

  it.each([
    ['open', 'No open checklists.'],
    ['done', 'No finished checklists yet.'],
  ])('says so, plainly, when there are no %s checklists', async (filter, message) => {
    installFakeApi({ apiGet: async () => list([]) });
    renderRoutes(routes, '/onboard/checklists');
    if (filter === 'done')
      await userEvent.click(await screen.findByRole('radio', { name: 'Done' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('shows why the list could not load, and Try again works', async () => {
    let attempts = 0;
    installFakeApi({
      apiGet: async () => {
        attempts += 1;
        return attempts === 1
          ? fail(403, 'Requires the super-admin or hr-admin role')
          : list([summary(1)]);
      },
    });
    renderRoutes(routes, '/onboard/checklists');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Requires the super-admin or hr-admin role',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Person 1')).toBeInTheDocument();
  });

  it('returns to the login page when the session has ended (401)', async () => {
    const api = installFakeApi({
      auth: adminAuth,
      apiGet: async () => {
        api.auth.status.mockResolvedValue(signedOut);
        return fail(401, 'You are not signed in');
      },
    });
    const { router } = renderRoutes(routes, '/onboard/checklists');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('sends a user without an admin role to the no-access page, and never asks for checklists', async () => {
    const api = installFakeApi({ auth: memberAuth });
    const { router } = renderRoutes(routes, '/onboard/checklists');

    await waitFor(() => expect(router.state.location.pathname).toBe('/no-access'));

    expect(api.api.get).not.toHaveBeenCalled();
  });
});

describe('Checklist screen for one person', () => {
  const detail = (overrides: Record<string, unknown> = {}) => ({
    subjectId: id(1),
    status: 'open',
    createdAt: '2026-10-09T12:00:00.000Z',
    completedAt: null,
    templateName: 'Developer',
    person: { displayName: 'Ann Lee', username: 'ann.lee' },
    manager: null,
    startDate: null,
    items: [
      {
        id: id(11),
        title: 'Order laptop',
        description: 'Standard developer spec.',
        status: 'pending',
        position: 0,
        completedAt: null,
      },
    ],
    ...overrides,
  });

  it('names the person, the username, the template and the start date, and focuses the heading', async () => {
    installFakeApi({ apiGet: async () => ok(detail()) });
    renderRoutes(routes, `/onboard/checklists/${id(1)}`);

    const heading = await screen.findByRole('heading', { level: 1, name: 'Checklist for Ann Lee' });

    expect(heading).toHaveFocus();
    expect(
      screen.getByText('Username ann.lee · Template Developer · Onboarded Oct 9, 2026'),
    ).toBeInTheDocument();
    expect(await screen.findByRole('checkbox', { name: 'Order laptop' })).toBeInTheDocument();
  });

  it('says so, instead of leaving a blank, when the person is not in the identity provider', async () => {
    installFakeApi({ apiGet: async () => ok(detail({ person: null, templateName: null })) });
    renderRoutes(routes, `/onboard/checklists/${id(1)}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Checklist for an unknown person' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Not found in the identity provider · Onboarded Oct 9, 2026'),
    ).toBeInTheDocument();
  });

  it('shows the manager by name and the start date, with the information-only note', async () => {
    installFakeApi({
      apiGet: async () =>
        ok(
          detail({
            manager: { subjectId: id(50), person: { displayName: 'Bea Boss', username: 'boss' } },
            startDate: '2026-10-20',
          }),
        ),
    });
    renderRoutes(routes, `/onboard/checklists/${id(1)}`);

    expect(
      await screen.findByText(/Manager Bea Boss · Start date Oct 20, 2026/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Information only\. The account was created and enabled when they were onboarded/,
      ),
    ).toBeInTheDocument();
  });

  it('shows a manager who cannot be looked up as unknown', async () => {
    installFakeApi({
      apiGet: async () => ok(detail({ manager: { subjectId: id(50), person: null } })),
    });
    renderRoutes(routes, `/onboard/checklists/${id(1)}`);

    expect(await screen.findByText(/Manager unknown/)).toBeInTheDocument();
  });

  it('shows no start date note when there is no start date', async () => {
    installFakeApi({ apiGet: async () => ok(detail()) });
    renderRoutes(routes, `/onboard/checklists/${id(1)}`);

    await screen.findByRole('heading', { level: 1, name: 'Checklist for Ann Lee' });

    expect(screen.queryByText(/Information only/)).not.toBeInTheDocument();
  });

  it('goes back to all checklists', async () => {
    installFakeApi({ apiGet: async () => ok(detail()) });
    const { router } = renderRoutes(routes, `/onboard/checklists/${id(1)}`);

    await userEvent.click(await screen.findByRole('link', { name: /All checklists/ }));

    expect(router.state.location.pathname).toBe('/onboard/checklists');
  });

  it('shows that the checklist does not exist for an unknown id', async () => {
    installFakeApi({ apiGet: async () => fail(404, 'Checklist not found') });
    renderRoutes(routes, `/onboard/checklists/${id(9)}`);

    expect(await screen.findByRole('alert')).toHaveTextContent('This checklist does not exist.');
    expect(screen.getByRole('heading', { level: 1, name: 'Checklist' })).toBeInTheDocument();
  });

  it('lets an admin tick a task right there', async () => {
    const api = installFakeApi({
      apiGet: async () => ok(detail()),
      checklistSetItem: async () =>
        ok(
          detail({
            status: 'done',
            items: [
              {
                id: id(11),
                title: 'Order laptop',
                description: null,
                status: 'done',
                position: 0,
                completedAt: '2026-10-09T13:00:00.000Z',
              },
            ],
          }),
        ),
    });
    renderRoutes(routes, `/onboard/checklists/${id(1)}`);

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Order laptop' }));

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Order laptop' })).toBeChecked(),
    );
    expect(api.api.checklists.setItem).toHaveBeenCalledWith(id(1), id(11), { done: true });
    expect(screen.getByText('All tasks done')).toBeInTheDocument();
  });
});
