import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiResponse } from '../../../src/shared/ipc';
import { OnboardPage } from '../../../src/renderer/src/pages/onboard-page';
import {
  adminAuth,
  installFakeApi,
  renderWithProviders,
  superAdminAuth,
  type FakeApiOptions,
} from './helpers/render-app';

const REASON = 'Only a super-admin can assign the admin role';
const SUBJECT_ID = '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11';
const PASSWORD = 'Kd7mPq2xRt9WnH4v';

const ok = (data: unknown, status = 200): ApiResponse => ({ ok: true, status, data });
const fail = (status: number, message: string, code?: string): ApiResponse => ({
  ok: false,
  status,
  message,
  ...(code && { code }),
});

const hrOptions = {
  departments: [
    { id: 'g-eng', name: 'Engineering', path: '/Engineering' },
    { id: 'g-sales', name: 'Sales', path: '/Sales' },
  ],
  roles: [
    { name: 'member', allowed: true },
    { name: 'manager', allowed: true },
    { name: 'admin', allowed: false, reason: REASON },
  ],
};

const superOptions = {
  ...hrOptions,
  roles: hrOptions.roles.map((r) => ({ name: r.name, allowed: true })),
};

const complete = (extra: Record<string, unknown> = {}) => ({
  status: 'complete',
  subjectId: SUBJECT_ID,
  steps: [
    { name: 'create_user', status: 'done' },
    { name: 'add_to_group', status: 'done' },
    { name: 'assign_role', status: 'done' },
  ],
  temporaryPassword: PASSWORD,
  ...extra,
});

const partial = {
  status: 'partial',
  subjectId: SUBJECT_ID,
  steps: [
    { name: 'create_user', status: 'done' },
    {
      name: 'add_to_group',
      status: 'failed',
      message: 'The identity provider could not complete this step.',
    },
    { name: 'assign_role', status: 'skipped', message: 'Not run because an earlier step failed' },
  ],
  temporaryPassword: PASSWORD,
};

function setup(options: FakeApiOptions & { options?: unknown } = {}) {
  const { options: optionsPayload = hrOptions, ...rest } = options;
  return installFakeApi({
    auth: adminAuth,
    apiGet: async (path) =>
      path === '/onboarding/options' ? ok(optionsPayload) : fail(404, 'not set up'),
    ...rest,
  });
}

async function fillForm(overrides: { role?: string } = {}) {
  await userEvent.type(await screen.findByLabelText('First name'), 'Ann');
  await userEvent.type(screen.getByLabelText('Last name'), 'Lee');
  await userEvent.type(screen.getByLabelText('Email'), 'Ann@Example.com');
  await userEvent.type(screen.getByLabelText('Username'), 'Ann.Lee');
  await userEvent.selectOptions(screen.getByLabelText('Department'), 'g-eng');
  if (overrides.role) await userEvent.selectOptions(screen.getByLabelText('Role'), overrides.role);
}

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Onboard employee' }));

const EXPECTED_INPUT = {
  firstName: 'Ann',
  lastName: 'Lee',
  email: 'ann@example.com',
  username: 'ann.lee',
  departmentGroupId: 'g-eng',
  role: 'member',
};

describe('Onboard screen: loading the form', () => {
  it('shows a loading state, then the departments', async () => {
    let release: (value: ApiResponse) => void = () => undefined;
    setup({
      apiGet: () => new Promise<ApiResponse>((resolve) => (release = resolve)),
    });
    renderWithProviders(<OnboardPage />);

    expect(screen.getByRole('heading', { name: 'Onboard' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading the form' })).toBeInTheDocument();

    release(ok(hrOptions));
    const department = await screen.findByLabelText('Department');
    expect(within(department).getByRole('option', { name: 'Engineering' })).toBeInTheDocument();
    expect(within(department).getByRole('option', { name: 'Sales' })).toBeInTheDocument();
  });

  it('offers a retry when the options cannot be loaded', async () => {
    let attempts = 0;
    setup({
      apiGet: async () => {
        attempts += 1;
        return attempts === 1
          ? fail(403, 'Requires the super-admin or hr-admin role')
          : ok(hrOptions);
      },
    });
    renderWithProviders(<OnboardPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Requires the super-admin or hr-admin role',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByLabelText('First name')).toBeInTheDocument();
  });

  it('says so when the identity provider has no departments', async () => {
    setup({ options: { departments: [], roles: hrOptions.roles } });
    renderWithProviders(<OnboardPage />);

    expect(await screen.findByText(/No departments were found/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Onboard employee' })).not.toBeInTheDocument();
  });

  it('explains an options response it does not understand', async () => {
    setup({ options: { nonsense: true } });
    renderWithProviders(<OnboardPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server sent a response this version of the app does not understand.',
    );
  });

  it('uses a generic message when something other than an API error is thrown', async () => {
    setup({
      apiGet: async () => {
        throw new Error('bridge crashed');
      },
    });
    renderWithProviders(<OnboardPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the departments.');
  });
});

describe('Onboard screen: the form', () => {
  it('labels every field and never offers the owner role', async () => {
    const api = setup();
    renderWithProviders(<OnboardPage />);

    for (const label of ['First name', 'Last name', 'Email', 'Username', 'Department', 'Role']) {
      expect(await screen.findByLabelText(label)).toBeInTheDocument();
    }
    const roles = within(screen.getByLabelText('Role')).getAllByRole('option');
    expect(roles.map((option) => option.textContent)).toEqual(['Member', 'Manager', 'Admin']);
    expect(screen.queryByRole('option', { name: /owner/i })).not.toBeInTheDocument();
    expect(api.api.onboarding.create).not.toHaveBeenCalled();
  });

  it('explains every invalid field in plain language and sends nothing', async () => {
    const api = setup();
    renderWithProviders(<OnboardPage />);
    await screen.findByLabelText('First name');

    await submit();

    expect(await screen.findByText('Enter a first name')).toBeInTheDocument();
    expect(screen.getByText('Enter a last name')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(
      screen.getByText('Use 3 to 64 letters, numbers, dots, dashes or underscores'),
    ).toBeInTheDocument();
    expect(screen.getByText('Choose a department')).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toBeInvalid();
    expect(screen.getByLabelText('First name')).toHaveAccessibleDescription('Enter a first name');
    expect(api.api.onboarding.create).not.toHaveBeenCalled();
  });

  it('disables the admin option with a hint for an hr-admin', async () => {
    setup({ auth: adminAuth, options: hrOptions });
    renderWithProviders(<OnboardPage />);

    await screen.findByLabelText('Role');

    expect(screen.getByRole('option', { name: 'Admin' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Member' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Manager' })).toBeEnabled();
    expect(screen.getByLabelText('Role')).toHaveAccessibleDescription(REASON);
  });

  it('enables the admin option, with no hint, for a super-admin', async () => {
    setup({ auth: superAdminAuth, options: superOptions });
    renderWithProviders(<OnboardPage />);

    await screen.findByLabelText('Role');

    expect(screen.getByRole('option', { name: 'Admin' })).toBeEnabled();
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
  });

  it('follows the configured super-admin role name from the session', async () => {
    const custom = {
      ...superAdminAuth,
      roles: ['it-owner'],
      adminRoles: ['it-owner', 'hr-admin'],
      superAdminRole: 'it-owner',
    };
    setup({ auth: custom, options: superOptions });
    const { unmount } = renderWithProviders(<OnboardPage />);
    await screen.findByLabelText('Role');
    expect(screen.getByRole('option', { name: 'Admin' })).toBeEnabled();
    unmount();

    setup({ auth: { ...custom, roles: ['super-admin'] }, options: superOptions });
    renderWithProviders(<OnboardPage />);
    await screen.findByLabelText('Role');
    expect(screen.getByRole('option', { name: 'Admin' })).toBeDisabled();
  });

  it('shows the hint in the server language when the server blocks a role for anyone', async () => {
    setup({
      auth: superAdminAuth,
      options: {
        ...hrOptions,
        roles: [
          { name: 'member', allowed: true },
          { name: 'manager', allowed: false },
          { name: 'admin', allowed: true },
        ],
      },
    });
    renderWithProviders(<OnboardPage />);

    await screen.findByLabelText('Role');

    expect(screen.getByRole('option', { name: 'Manager' })).toBeDisabled();
    expect(screen.getByLabelText('Role')).toHaveAccessibleDescription(REASON);
  });
});

describe('Onboard screen: success', () => {
  it('sends the cleaned values and shows the summary and the one-time password', async () => {
    const api = setup({ onboardingCreate: async () => ok(complete(), 201) });
    renderWithProviders(<OnboardPage />);

    await fillForm();
    await submit();

    expect(await screen.findByText('Employee onboarded')).toBeInTheDocument();
    expect(api.api.onboarding.create).toHaveBeenCalledTimes(1);
    expect(api.api.onboarding.create).toHaveBeenCalledWith(EXPECTED_INPUT);
    expect(screen.getByText('Ann Lee now has an account.')).toBeInTheDocument();
    const summary = screen.getByText('Department').closest('dl')!;
    expect(summary).toHaveTextContent('ann.lee');
    expect(summary).toHaveTextContent('ann@example.com');
    expect(summary).toHaveTextContent('Engineering');
    expect(screen.getByRole('list', { name: 'Onboarding steps' })).toHaveTextContent('Done');
    expect(
      within(screen.getByRole('list', { name: 'Onboarding steps' })).getAllByText('Done'),
    ).toHaveLength(3);
    expect(screen.getByLabelText('Temporary password')).toHaveTextContent(PASSWORD);
    expect(screen.getByText(/will not be shown again/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument();
  });

  it('moves keyboard focus to the result heading', async () => {
    setup({ onboardingCreate: async () => ok(complete(), 201) });
    renderWithProviders(<OnboardPage />);

    await fillForm();
    await submit();

    expect(await screen.findByText('Employee onboarded')).toHaveFocus();
  });

  it('copies the password with the Copy button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup({ onboardingCreate: async () => ok(complete(), 201) });
    renderWithProviders(<OnboardPage />);
    await fillForm();
    await submit();

    await userEvent.click(await screen.findByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith(PASSWORD);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('tells the admin to copy by hand when the clipboard is not available', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup({ onboardingCreate: async () => ok(complete(), 201) });
    renderWithProviders(<OnboardPage />);
    await fillForm();
    await submit();

    await userEvent.click(await screen.findByRole('button', { name: 'Copy' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy automatically');
    expect(screen.getByLabelText('Temporary password')).toHaveTextContent(PASSWORD);
  });

  it('clears everything, password included, with "Onboard another"', async () => {
    setup({ onboardingCreate: async () => ok(complete(), 201) });
    renderWithProviders(<OnboardPage />);
    await fillForm();
    await submit();
    await screen.findByText('Employee onboarded');

    await userEvent.click(screen.getByRole('button', { name: 'Onboard another' }));

    expect(await screen.findByLabelText('First name')).toHaveValue('');
    expect(screen.getByLabelText('Username')).toHaveValue('');
    expect(screen.getByLabelText('Department')).toHaveValue('');
    expect(screen.getByLabelText('Role')).toHaveValue('member');
    expect(screen.queryByText(PASSWORD)).not.toBeInTheDocument();
    expect(screen.queryByText('Employee onboarded')).not.toBeInTheDocument();
  });

  it('does not keep the password in the query or mutation cache', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setup({ onboardingCreate: async () => ok(complete(), 201) });
    render(
      <QueryClientProvider client={client}>
        <OnboardPage />
      </QueryClientProvider>,
    );
    await fillForm();
    await submit();
    await screen.findByText('Employee onboarded');

    await waitFor(() => expect(client.getMutationCache().getAll()).toHaveLength(0));
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain(PASSWORD);
  });

  it('forgets the password when the page is left', async () => {
    setup({ onboardingCreate: async () => ok(complete(), 201) });
    const first = renderWithProviders(<OnboardPage />);
    await fillForm();
    await submit();
    await screen.findByLabelText('Temporary password');

    first.unmount();
    expect(screen.queryByText(PASSWORD)).not.toBeInTheDocument();

    renderWithProviders(<OnboardPage />);
    expect(await screen.findByLabelText('First name')).toHaveValue('');
    expect(screen.queryByText(PASSWORD)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(PASSWORD);
  });
});

describe('Onboard screen: errors from the API', () => {
  it('puts "Username already exists" next to the username field and keeps the input', async () => {
    setup({
      onboardingCreate: async () => fail(409, 'Username already exists', 'username_exists'),
    });
    renderWithProviders(<OnboardPage />);
    await fillForm();

    await submit();

    const username = screen.getByLabelText('Username');
    await waitFor(() => expect(username).toBeInvalid());
    expect(username).toHaveAccessibleDescription(
      expect.stringContaining('Username already exists'),
    );
    expect(screen.getByLabelText('Email')).not.toBeInvalid();
    expect(screen.getByLabelText('First name')).toHaveValue('Ann');
    expect(screen.queryByText('Employee onboarded')).not.toBeInTheDocument();
  });

  it('puts "Email already exists" next to the email field', async () => {
    setup({
      onboardingCreate: async () => fail(409, 'Email already exists', 'email_exists'),
    });
    renderWithProviders(<OnboardPage />);
    await fillForm();

    await submit();

    const email = screen.getByLabelText('Email');
    await waitFor(() => expect(email).toBeInvalid());
    expect(email).toHaveAccessibleDescription('Email already exists');
    expect(screen.getByLabelText('Username')).not.toBeInvalid();
  });

  it.each([
    [
      403,
      'Only a super-admin can assign the admin role',
      'Only a super-admin can assign the admin role',
    ],
    [400, 'The selected department does not exist', 'The selected department does not exist'],
    [429, 'Too many requests', 'Too many requests. Wait a minute and try again.'],
    [
      0,
      'Could not reach the AccessDesk API at http://x',
      'Could not confirm the result. Check the Employees list before trying again, because the account may have been created.',
    ],
    [
      502,
      'Identity provider request failed (500): raw detail',
      'The request failed. Check the Employees list before trying again.',
    ],
  ])('shows a plain message for a %i answer', async (status, apiMessage, shown) => {
    setup({ onboardingCreate: async () => fail(status, apiMessage) });
    renderWithProviders(<OnboardPage />);
    await fillForm();

    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(shown);
    expect(screen.queryByText(/raw detail/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toHaveValue('Ann');
  });

  it('explains a result it does not understand without showing it', async () => {
    setup({ onboardingCreate: async () => ok({ status: 'complete' }, 201) });
    renderWithProviders(<OnboardPage />);
    await fillForm();

    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The request failed. Check the Employees list before trying again.',
    );
  });

  it('uses a generic message when something other than an API error is thrown', async () => {
    setup({
      onboardingCreate: async () => {
        throw new Error('bridge crashed');
      },
    });
    renderWithProviders(<OnboardPage />);
    await fillForm();

    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
  });

  it('asks the session to be checked again after a 401', async () => {
    const api = setup({ onboardingCreate: async () => fail(401, 'You are not signed in') });
    renderWithProviders(<OnboardPage />);
    await fillForm();
    const before = api.auth.status.mock.calls.length;

    await submit();

    await waitFor(() => expect(api.auth.status.mock.calls.length).toBeGreaterThan(before));
  });

  it('never repeats a create request on its own, even when mutations would retry by default', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: 3, retryDelay: 0 } },
    });
    const api = setup({ onboardingCreate: async () => fail(503, 'unavailable') });
    render(
      <QueryClientProvider client={client}>
        <OnboardPage />
      </QueryClientProvider>,
    );
    await fillForm();

    await submit();
    await screen.findByRole('alert');

    expect(api.api.onboarding.create).toHaveBeenCalledTimes(1);
  });

  it('blocks a second submit while the first is still running', async () => {
    let finish: (value: ApiResponse) => void = () => undefined;
    const api = setup({
      onboardingCreate: () => new Promise<ApiResponse>((resolve) => (finish = resolve)),
    });
    renderWithProviders(<OnboardPage />);
    await fillForm();

    await submit();
    const busy = await screen.findByRole('button', { name: 'Creating…' });
    expect(busy).toBeDisabled();
    await userEvent.click(busy);
    expect(api.api.onboarding.create).toHaveBeenCalledTimes(1);

    finish(ok(complete(), 201));
    expect(await screen.findByText('Employee onboarded')).toBeInTheDocument();
  });
});

describe('Onboard screen: error summary', () => {
  it('moves focus to a summary that names each invalid field, without repeating the messages', async () => {
    setup();
    renderWithProviders(<OnboardPage />);
    await screen.findByLabelText('First name');

    await submit();

    const summary = await screen.findByRole('group', { name: 'Fix these fields to continue' });
    await waitFor(() => expect(summary).toHaveFocus());
    const items = within(summary)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(items).toEqual(['First name', 'Last name', 'Email', 'Username', 'Department']);
    expect(within(summary).queryByText('Enter a first name')).not.toBeInTheDocument();
    expect(screen.getAllByText('Enter a first name')).toHaveLength(1);
  });

  it('jumps to the field when its summary entry is chosen', async () => {
    setup();
    renderWithProviders(<OnboardPage />);
    await screen.findByLabelText('First name');
    await submit();

    const summary = await screen.findByRole('group', { name: 'Fix these fields to continue' });
    await userEvent.click(within(summary).getByRole('button', { name: 'Email' }));

    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('drops the summary once the form is valid, and keeps it for a server error out of it', async () => {
    setup({
      onboardingCreate: async () => fail(409, 'Username already exists', 'username_exists'),
    });
    renderWithProviders(<OnboardPage />);
    await screen.findByLabelText('First name');
    await submit();
    await screen.findByRole('group', { name: 'Fix these fields to continue' });

    await fillForm();
    await submit();

    await waitFor(() => expect(screen.getByLabelText('Username')).toBeInvalid());
    expect(
      screen.queryByRole('group', { name: 'Fix these fields to continue' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveFocus();
  });

  it('groups the fields so a screen reader announces where each one belongs', async () => {
    setup();
    renderWithProviders(<OnboardPage />);

    await screen.findByLabelText('First name');

    expect(screen.getByRole('group', { name: 'Who they are' })).toContainElement(
      screen.getByLabelText('First name'),
    );
    expect(screen.getByRole('group', { name: 'Sign-in details' })).toContainElement(
      screen.getByLabelText('Username'),
    );
    expect(screen.getByRole('group', { name: 'Where they work' })).toContainElement(
      screen.getByLabelText('Department'),
    );
  });

  it('shows a failure that belongs to no field as one alert with a title', async () => {
    setup({ onboardingCreate: async () => fail(429, 'Too many requests') });
    renderWithProviders(<OnboardPage />);
    await fillForm();

    await submit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not create the account');
    expect(
      screen.queryByRole('group', { name: 'Fix these fields to continue' }),
    ).not.toBeInTheDocument();
  });
});

describe('Onboard screen: partial result', () => {
  async function reachPartial(options: FakeApiOptions = {}) {
    const api = setup({ onboardingCreate: async () => ok(partial, 207), ...options });
    renderWithProviders(<OnboardPage />);
    await fillForm({ role: 'manager' });
    await submit();
    await screen.findByText('Onboarding is not finished');
    return api;
  }

  it('shows what finished, what failed and what did not run, with Retry and the password', async () => {
    await reachPartial();

    const steps = screen.getByRole('list', { name: 'Onboarding steps' });
    expect(within(steps).getByText('Done')).toBeInTheDocument();
    expect(within(steps).getByText('Failed')).toBeInTheDocument();
    expect(within(steps).getByText('Skipped')).toBeInTheDocument();
    expect(steps).toHaveTextContent('The identity provider could not complete this step.');
    expect(screen.getByText(/has not been deleted/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(screen.getByLabelText('Temporary password')).toHaveTextContent(PASSWORD);
  });

  it('retries with the chosen department and role, then shows success and keeps the password', async () => {
    const api = await reachPartial({
      onboardingRetry: async () =>
        ok({
          status: 'complete',
          subjectId: SUBJECT_ID,
          steps: [
            { name: 'create_user', status: 'skipped', message: 'Already done' },
            { name: 'add_to_group', status: 'done' },
            { name: 'assign_role', status: 'done' },
          ],
        }),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Employee onboarded')).toBeInTheDocument();
    expect(api.api.onboarding.retry).toHaveBeenCalledTimes(1);
    expect(api.api.onboarding.retry).toHaveBeenCalledWith(SUBJECT_ID, {
      departmentGroupId: 'g-eng',
      role: 'manager',
    });
    expect(screen.getByLabelText('Temporary password')).toHaveTextContent(PASSWORD);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('stays on the partial screen when the retry is still incomplete', async () => {
    await reachPartial({ onboardingRetry: async () => ok(partial, 207) });

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled());
    expect(screen.getByText('Onboarding is not finished')).toBeInTheDocument();
    expect(screen.getByLabelText('Temporary password')).toHaveTextContent(PASSWORD);
  });

  it('shows why a retry failed and keeps the password and the Retry button', async () => {
    await reachPartial({
      onboardingRetry: async () => fail(403, 'This onboarding cannot be retried from this account'),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This onboarding cannot be retried from this account',
    );
    expect(screen.getByLabelText('Temporary password')).toHaveTextContent(PASSWORD);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('disables Retry while a retry is running and never repeats it on its own', async () => {
    let finish: (value: ApiResponse) => void = () => undefined;
    const api = await reachPartial({
      onboardingRetry: () => new Promise<ApiResponse>((resolve) => (finish = resolve)),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    const busy = await screen.findByRole('button', { name: 'Retrying…' });
    expect(busy).toBeDisabled();
    await userEvent.click(busy);
    expect(api.api.onboarding.retry).toHaveBeenCalledTimes(1);

    finish(fail(503, 'down'));
    await screen.findByRole('alert');
    expect(api.api.onboarding.retry).toHaveBeenCalledTimes(1);
  });

  it('asks the session to be checked again after a 401 on retry', async () => {
    const api = await reachPartial({
      onboardingRetry: async () => fail(401, 'You are not signed in'),
    });
    const before = api.auth.status.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(api.auth.status.mock.calls.length).toBeGreaterThan(before));
  });

  it('starts over with "Onboard another" and drops the password', async () => {
    await reachPartial();

    await userEvent.click(screen.getByRole('button', { name: 'Onboard another' }));

    expect(await screen.findByLabelText('First name')).toHaveValue('');
    expect(screen.queryByText(PASSWORD)).not.toBeInTheDocument();
  });
});
