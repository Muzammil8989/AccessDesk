import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { OnboardPage } from '../../../src/renderer/src/pages/onboard-page';
import type { ApiResponse } from '../../../src/shared/ipc';
import {
  adminAuth,
  employee,
  installFakeApi,
  renderWithProviders,
  type FakeApiOptions,
} from './helpers/render-app';

const SUBJECT_ID = '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11';
const PASSWORD = 'Kd7mPq2xRt9WnH4v';
const NOTE =
  'Information only. The account is created and enabled now. It does not unlock on this date.';
const SAVED_NOTE =
  'Information only. The account was created and enabled when they were onboarded. It does not unlock on this date.';

const ok = (data: unknown, status = 200): ApiResponse => ({ ok: true, status, data });
const fail = (status: number, message: string, code?: string): ApiResponse => ({
  ok: false,
  status,
  message,
  ...(code && { code }),
});

const options = {
  departments: [{ id: 'g-eng', name: 'Engineering', path: '/Engineering' }],
  roles: [
    { name: 'member', allowed: true },
    { name: 'manager', allowed: true },
    { name: 'admin', allowed: false, reason: 'Only a super-admin can assign the admin role' },
  ],
};

const boss = employee(7, { firstName: 'Bea', lastName: 'Boss', username: 'boss' });
const gone = employee(8, { firstName: 'Gus', lastName: 'Gone', username: 'gus', enabled: false });

const page = (items: unknown[], total = items.length) => ok({ items, total, first: 0, max: 20 });

function setup(
  config: { employees?: (search: string) => Promise<ApiResponse> } & FakeApiOptions = {},
) {
  const { employees, ...rest } = config;
  return installFakeApi({
    auth: adminAuth,
    apiGet: async (path, query) => {
      if (path === '/onboarding/options') return ok(options);
      if (path === '/templates') return ok({ items: [] });
      if (path === '/employees') {
        return employees ? employees(String(query?.search ?? '')) : page([boss, gone]);
      }
      return fail(404, 'not set up');
    },
    ...rest,
  });
}

async function fillPerson() {
  await userEvent.type(await screen.findByLabelText('First name'), 'Ann');
  await userEvent.type(screen.getByLabelText('Last name'), 'Lee');
  await userEvent.type(screen.getByLabelText('Email'), 'ann@example.com');
  await userEvent.type(screen.getByLabelText('Username'), 'ann.lee');
  await userEvent.selectOptions(screen.getByLabelText('Department'), 'g-eng');
}

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Onboard employee' }));

async function chooseBoss() {
  await userEvent.type(await screen.findByLabelText('Search for a manager'), 'bea');
  await userEvent.click(await screen.findByRole('radio', { name: /Bea Boss/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Use this person as manager' }));
}

describe('Onboard form: the start date', () => {
  it('says in plain words, always, that the start date is information only', async () => {
    setup();
    renderWithProviders(<OnboardPage />);

    const field = await screen.findByLabelText('Start date (optional)');

    expect(field).toHaveAttribute('type', 'date');
    expect(field).toHaveAccessibleDescription(NOTE);
    expect(screen.getByText(NOTE)).toBeVisible();
  });

  it('sends the date as typed, and sends none when the field is empty', async () => {
    const api = setup({
      onboardingCreate: async () =>
        ok(
          { status: 'complete', subjectId: SUBJECT_ID, steps: [], temporaryPassword: PASSWORD },
          201,
        ),
    });
    renderWithProviders(<OnboardPage />);
    await fillPerson();

    await submit();

    await screen.findByText('Employee onboarded');
    const sent = api.api.onboarding.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent.startDate).toBeUndefined();
    expect(sent.managerSubjectId).toBeUndefined();
  });

  it('sends the chosen date, and shows it with the note on the result screen', async () => {
    const api = setup({
      onboardingCreate: async () =>
        ok(
          { status: 'complete', subjectId: SUBJECT_ID, steps: [], temporaryPassword: PASSWORD },
          201,
        ),
    });
    renderWithProviders(<OnboardPage />);
    await fillPerson();
    await userEvent.type(screen.getByLabelText('Start date (optional)'), '2026-10-20');

    await submit();

    await screen.findByText('Employee onboarded');
    expect(api.api.onboarding.create).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2026-10-20' }),
    );
    expect(screen.getByText('Start date')).toBeInTheDocument();
    expect(screen.getByText('Oct 20, 2026')).toBeInTheDocument();
    expect(screen.getByText(SAVED_NOTE)).toBeInTheDocument();
  });

  it('does not mention a start date on the result screen when none was given', async () => {
    setup({
      onboardingCreate: async () =>
        ok(
          { status: 'complete', subjectId: SUBJECT_ID, steps: [], temporaryPassword: PASSWORD },
          201,
        ),
    });
    renderWithProviders(<OnboardPage />);
    await fillPerson();

    await submit();

    await screen.findByText('Employee onboarded');
    expect(screen.queryByText('Start date')).not.toBeInTheDocument();
    expect(screen.queryByText(SAVED_NOTE)).not.toBeInTheDocument();
  });
});

describe('Onboard form: choosing a manager', () => {
  it('says to type at least two letters, and does not search before that', async () => {
    const api = setup();
    renderWithProviders(<OnboardPage />);
    const search = await screen.findByLabelText('Search for a manager');

    expect(search).toHaveAccessibleDescription(
      'Type at least 2 letters to search the identity provider.',
    );
    await userEvent.type(search, 'b');
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(api.api.get).not.toHaveBeenCalledWith('/employees', expect.anything());
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('lists the matching people as radio buttons, and does not pick anyone just because the arrow keys moved', async () => {
    setup();
    renderWithProviders(<OnboardPage />);
    await userEvent.type(await screen.findByLabelText('Search for a manager'), 'bo');

    const group = await screen.findByRole('group', { name: 'People who match your search' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(2);
    radios[0]!.focus();
    await userEvent.keyboard('{ArrowDown}');

    expect(screen.getByRole('button', { name: 'Use this person as manager' })).toBeDisabled();
    expect(screen.queryByText(/Remove .* as manager/)).not.toBeInTheDocument();
  });

  it('shows a person with a disabled account but does not let them be chosen, and says why', async () => {
    setup();
    renderWithProviders(<OnboardPage />);
    await userEvent.type(await screen.findByLabelText('Search for a manager'), 'gus');

    const radio = await screen.findByRole('radio', { name: /Gus Gone/ });

    expect(radio).toBeDisabled();
    expect(screen.getByText(/account disabled, cannot be chosen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use this person as manager' })).toBeDisabled();
  });

  it('chooses with a radio and the button, then shows the person with a Remove button', async () => {
    setup();
    renderWithProviders(<OnboardPage />);

    await chooseBoss();

    const field = screen.getByRole('group', { name: 'Manager (optional)' });
    expect(within(field).getByText('Bea Boss')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Bea Boss as manager' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Search for a manager')).not.toBeInTheDocument();
    expect(screen.getByText(/saved on the checklist by ID/)).toBeInTheDocument();
  });

  it('removes the manager again and goes back to the search', async () => {
    setup();
    renderWithProviders(<OnboardPage />);
    await chooseBoss();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Bea Boss as manager' }));

    expect(screen.getByLabelText('Search for a manager')).toHaveValue('');
  });

  it('says when no one matches, and when the search fails, with Try again', async () => {
    let calls = 0;
    setup({
      employees: async () => {
        calls += 1;
        return calls === 1
          ? page([])
          : calls === 2
            ? fail(403, 'Requires the super-admin or hr-admin role')
            : page([boss]);
      },
    });
    renderWithProviders(<OnboardPage />);
    const search = await screen.findByLabelText('Search for a manager');

    await userEvent.type(search, 'zz');
    expect(await screen.findByText('No one matches “zz”.')).toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, 'yy');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Requires the super-admin or hr-admin role',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('radio', { name: /Bea Boss/ })).toBeInTheDocument();
  });

  it('says only the first 20 are shown when there are more matches', async () => {
    setup({ employees: async () => page([boss], 35) });
    renderWithProviders(<OnboardPage />);
    await userEvent.type(await screen.findByLabelText('Search for a manager'), 'bo');

    expect(await screen.findByText(/Showing the first 20 of 35/)).toBeInTheDocument();
  });

  it('sends the chosen manager, and shows the manager by name on the result screen', async () => {
    const api = setup({
      onboardingCreate: async () =>
        ok(
          { status: 'complete', subjectId: SUBJECT_ID, steps: [], temporaryPassword: PASSWORD },
          201,
        ),
    });
    renderWithProviders(<OnboardPage />);
    await fillPerson();
    await chooseBoss();

    await submit();

    await screen.findByText('Employee onboarded');
    expect(api.api.onboarding.create).toHaveBeenCalledWith(
      expect.objectContaining({ managerSubjectId: boss.id }),
    );
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByText('Bea Boss')).toBeInTheDocument();
  });

  it('repeats the manager and the start date on Retry', async () => {
    const steps = [
      { name: 'create_user', status: 'done' },
      {
        name: 'assign_role',
        status: 'failed',
        message: 'The identity provider could not complete this step.',
      },
    ];
    const api = setup({
      onboardingCreate: async () =>
        ok({ status: 'partial', subjectId: SUBJECT_ID, steps, temporaryPassword: PASSWORD }, 207),
      onboardingRetry: async () => ok({ status: 'complete', subjectId: SUBJECT_ID, steps: [] }),
    });
    renderWithProviders(<OnboardPage />);
    await fillPerson();
    await chooseBoss();
    await userEvent.type(screen.getByLabelText('Start date (optional)'), '2026-10-20');
    await submit();
    await screen.findByText('Onboarding is not finished');

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(api.api.onboarding.retry).toHaveBeenCalledWith(SUBJECT_ID, {
        departmentGroupId: 'g-eng',
        role: 'member',
        managerSubjectId: boss.id,
        startDate: '2026-10-20',
      }),
    );
  });

  it.each([
    ['unknown_manager', 'The selected manager was not found'],
    ['manager_disabled', "The selected manager's account is disabled"],
  ])(
    'shows %s next to the manager, moves focus there, and keeps everything typed',
    async (code, message) => {
      setup({ onboardingCreate: async () => fail(400, message, code) });
      renderWithProviders(<OnboardPage />);
      await fillPerson();
      await chooseBoss();

      await submit();

      const alert = await screen.findByText(message);
      expect(alert).toHaveAttribute('role', 'alert');
      expect(document.getElementById('manager-field')).toHaveFocus();
      expect(screen.getByLabelText('First name')).toHaveValue('Ann');
      expect(
        screen.getByRole('button', { name: 'Remove Bea Boss as manager' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Employee onboarded')).not.toBeInTheDocument();
    },
  );

  it('lets the admin remove the refused manager and try again without one', async () => {
    let calls = 0;
    const api = setup({
      onboardingCreate: async () => {
        calls += 1;
        return calls === 1
          ? fail(400, 'The selected manager was not found', 'unknown_manager')
          : ok(
              { status: 'complete', subjectId: SUBJECT_ID, steps: [], temporaryPassword: PASSWORD },
              201,
            );
      },
    });
    renderWithProviders(<OnboardPage />);
    await fillPerson();
    await chooseBoss();
    await submit();
    await screen.findByText('The selected manager was not found');

    await userEvent.click(screen.getByRole('button', { name: 'Remove Bea Boss as manager' }));
    await submit();

    await screen.findByText('Employee onboarded');
    const sent = api.api.onboarding.create.mock.calls[1]![0] as Record<string, unknown>;
    expect(sent.managerSubjectId).toBeUndefined();
  });
});
