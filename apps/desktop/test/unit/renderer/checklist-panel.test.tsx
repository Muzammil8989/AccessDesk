import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChecklistPanel } from '../../../src/renderer/src/components/checklist-panel';
import { authQuery } from '../../../src/renderer/src/lib/session';
import type { ApiResponse } from '../../../src/shared/ipc';
import { adminAuth, installFakeApi, renderWithProviders } from './helpers/render-app';

const SUBJECT = '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11';
const LAPTOP = '00000000-0000-4000-8000-000000000001';
const TRAINING = '00000000-0000-4000-8000-000000000002';

const task = (id: string, title: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title,
  description: null,
  status: 'pending',
  position: 0,
  completedAt: null,
  ...overrides,
});

const detail = (items: unknown[], overrides: Record<string, unknown> = {}) => ({
  subjectId: SUBJECT,
  status: 'open',
  createdAt: '2026-10-09T12:00:00.000Z',
  completedAt: null,
  templateName: 'Developer',
  person: { displayName: 'Ann Lee', username: 'ann.lee' },
  items,
  ...overrides,
});

const ok = (data: unknown): ApiResponse => ({ ok: true, status: 200, data });
const fail = (status: number, message: string): ApiResponse => ({ ok: false, status, message });

const twoTasks = () => [
  task(LAPTOP, 'Order laptop', { description: 'Standard developer spec.' }),
  task(TRAINING, 'Security training', { position: 1 }),
];

function setup(options: Parameters<typeof installFakeApi>[0] = {}, current = detail(twoTasks())) {
  return installFakeApi({
    auth: adminAuth,
    apiGet: async (path) =>
      path === `/checklists/${SUBJECT}` ? ok(current) : fail(404, 'not set up'),
    ...options,
  });
}

describe('ChecklistPanel: reading', () => {
  it('lists every task as a checkbox named by its title, with the description as its description', async () => {
    setup();
    renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);

    const laptop = await screen.findByRole('checkbox', { name: 'Order laptop' });

    expect(laptop).not.toBeChecked();
    expect(laptop).toHaveAccessibleDescription('Standard developer spec.');
    expect(screen.getByRole('checkbox', { name: 'Security training' })).toBeInTheDocument();
    expect(screen.getByText('0 of 2 tasks done')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Tasks for the new employee' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Checklist for the new employee' }),
    ).toBeInTheDocument();
  });

  it('shows done tasks ticked, the progress and an "All tasks done" badge when none are left', async () => {
    setup(
      {},
      detail(
        [
          task(LAPTOP, 'Order laptop', { status: 'done' }),
          task(TRAINING, 'Security training', { status: 'done', position: 1 }),
        ],
        { status: 'done' },
      ),
    );
    renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);

    expect(await screen.findByRole('checkbox', { name: 'Order laptop' })).toBeChecked();
    expect(screen.getByText('2 of 2 tasks done')).toBeInTheDocument();
    expect(screen.getByText('All tasks done')).toBeInTheDocument();
  });

  it('uses the singular for one task, and says so when there are none', async () => {
    const one = setup({}, detail([task(LAPTOP, 'Order laptop')]));
    const { unmount } = renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);
    expect(await screen.findByText('0 of 1 task done')).toBeInTheDocument();
    unmount();
    one.api.get.mockImplementation(async () => ok(detail([])));

    renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);

    expect(await screen.findByText('This checklist has no tasks.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows a loading state first', async () => {
    setup({ apiGet: () => new Promise<ApiResponse>(() => undefined) });
    renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);

    expect(screen.getByRole('status', { name: 'Loading the checklist' })).toBeInTheDocument();
  });

  it('says a checklist that does not exist does not exist, and offers Try again', async () => {
    setup({ apiGet: async () => fail(404, 'Checklist not found') });
    renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('This checklist does not exist.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('offers Try again after a failed load, and shows the tasks when it works', async () => {
    let attempts = 0;
    setup({
      apiGet: async () => {
        attempts += 1;
        return attempts === 1
          ? fail(403, 'Requires the super-admin or hr-admin role')
          : ok(detail(twoTasks()));
      },
    });
    renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the checklist.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('checkbox', { name: 'Order laptop' })).toBeInTheDocument();
  });
});

describe('ChecklistPanel: ticking', () => {
  it('saves a tick, shows it, and announces it politely with the new progress', async () => {
    const after = detail([
      task(LAPTOP, 'Order laptop', { status: 'done', completedAt: '2026-10-09T13:00:00.000Z' }),
      task(TRAINING, 'Security training', { position: 1 }),
    ]);
    const api = setup({ checklistSetItem: async () => ok(after) });
    renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Order laptop' }));

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Order laptop' })).toBeChecked(),
    );
    expect(api.api.checklists.setItem).toHaveBeenCalledWith(SUBJECT, LAPTOP, { done: true });
    expect(screen.getByText('1 of 2 tasks done')).toBeInTheDocument();
    const live = screen
      .getAllByRole('status')
      .find((element) => element.textContent?.includes('marked done'));
    expect(live).toHaveTextContent('Order laptop marked done. 1 of 2 tasks done.');
    expect(live).toHaveClass('sr-only');
  });

  it('unticks a task the same way', async () => {
    const before = detail([
      task(LAPTOP, 'Order laptop', { status: 'done' }),
      task(TRAINING, 'Security training', { position: 1 }),
    ]);
    const api = setup({ checklistSetItem: async () => ok(detail(twoTasks())) }, before);
    renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Order laptop' }));

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Order laptop' })).not.toBeChecked(),
    );
    expect(api.api.checklists.setItem).toHaveBeenCalledWith(SUBJECT, LAPTOP, { done: false });
    expect(
      screen.getByText(/Order laptop marked not done\. 0 of 2 tasks done\./),
    ).toBeInTheDocument();
  });

  it('works from the keyboard alone: Tab to the checkbox, Space to tick', async () => {
    const api = setup({
      checklistSetItem: async () => ok(detail([task(LAPTOP, 'Order laptop', { status: 'done' })])),
    });
    renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);
    await screen.findByRole('checkbox', { name: 'Order laptop' });

    await userEvent.tab();
    expect(screen.getByRole('checkbox', { name: 'Order laptop' })).toHaveFocus();
    await userEvent.keyboard(' ');

    await waitFor(() => expect(api.api.checklists.setItem).toHaveBeenCalledTimes(1));
    expect(api.api.checklists.setItem).toHaveBeenCalledWith(SUBJECT, LAPTOP, { done: true });
  });

  it('only changes the checkbox once the server has accepted it, and ignores a second click while saving', async () => {
    let finish: (response: ApiResponse) => void = () => undefined;
    const api = setup({
      checklistSetItem: () => new Promise<ApiResponse>((resolve) => (finish = resolve)),
    });
    renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);
    const laptop = await screen.findByRole('checkbox', { name: 'Order laptop' });

    await userEvent.click(laptop);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Security training' }));

    expect(laptop).not.toBeChecked();
    expect(screen.getByRole('group', { name: 'Tasks for the new employee' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(api.api.checklists.setItem).toHaveBeenCalledTimes(1);
    finish(ok(detail([task(LAPTOP, 'Order laptop', { status: 'done' })])));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Order laptop' })).toBeChecked(),
    );
  });

  it('leaves the task unchanged and says so when the save fails', async () => {
    setup({ checklistSetItem: async () => fail(500, 'Internal server error') });
    renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Order laptop' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not confirm the change.');
    expect(alert).toHaveTextContent('Internal server error');
    expect(screen.getByRole('checkbox', { name: 'Order laptop' })).not.toBeChecked();
    expect(
      within(screen.getByRole('group', { name: 'Tasks for the new employee' })).getAllByRole(
        'checkbox',
      ),
    ).toHaveLength(2);
  });

  it('shows what is really saved after a failed save, because a timed-out request may have been applied', async () => {
    let saved = false;
    setup({
      apiGet: async () =>
        ok(
          detail([
            task(LAPTOP, 'Order laptop', { status: saved ? 'done' : 'pending' }),
            task(TRAINING, 'Security training', { position: 1 }),
          ]),
        ),
      checklistSetItem: async () => {
        saved = true;
        return fail(0, 'Could not reach the AccessDesk API at http://localhost:4000');
      },
    });
    renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Order laptop' }));

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Order laptop' })).toBeChecked(),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not confirm the change.');
    expect(screen.getByRole('alert')).toHaveTextContent('The tasks above show what is saved.');
  });

  it('toggles when the title is clicked, so the whole row is the target', async () => {
    const api = setup({ checklistSetItem: async () => ok(detail(twoTasks())) });
    renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);
    const label = (await screen.findByText('Order laptop')).closest('label')!;

    await userEvent.click(screen.getByText('Order laptop'));

    expect(label).toHaveClass('min-h-10', 'cursor-pointer');
    await waitFor(() => expect(api.api.checklists.setItem).toHaveBeenCalledTimes(1));
  });

  it.each([
    ['a checklist with the wrong shape', { subjectId: SUBJECT, items: 'nope' }],
    ['a task with an unknown status', detail([task(LAPTOP, 'Order laptop', { status: 'maybe' })])],
  ])('explains %s in plain words, never raw validation output', async (_label, body) => {
    setup({ apiGet: async () => ok(body) });
    renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Could not load the checklist.');
    expect(document.body).not.toHaveTextContent(/invalid_type|expected|zod|undefined/i);
  });

  it('explains a tick response with the wrong shape in plain words', async () => {
    setup({ checklistSetItem: async () => ok({ nope: true }) });
    renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Order laptop' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'The server sent a response this version of the app does not understand.',
    );
    expect(alert).not.toHaveTextContent(/invalid_type|expected|zod/i);
  });

  it('is a level 3 heading when it sits inside another section, and level 2 on its own', async () => {
    setup();
    const inner = renderWithProviders(<ChecklistPanel subjectId={SUBJECT} headingLevel={3} />);
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Checklist for the new employee' }),
    ).toBeInTheDocument();
    inner.unmount();

    renderWithProviders(<ChecklistPanel subjectId={SUBJECT} />);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Checklist for the new employee' }),
    ).toBeInTheDocument();
  });

  it('asks the session to be checked again after a 401', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    setup({ checklistSetItem: async () => fail(401, 'You are not signed in') });
    render(
      <QueryClientProvider client={client}>
        <ChecklistPanel subjectId={SUBJECT} />
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Order laptop' }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: authQuery.queryKey }));
  });
});
