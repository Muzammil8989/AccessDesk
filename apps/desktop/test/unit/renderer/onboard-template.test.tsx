import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { OnboardPage } from '../../../src/renderer/src/pages/onboard-page';
import type { ApiResponse } from '../../../src/shared/ipc';
import {
  adminAuth,
  installFakeApi,
  renderWithProviders,
  superAdminAuth,
  type FakeApiOptions,
} from './helpers/render-app';

const SUBJECT_ID = '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11';
const T_DEV = '5b0e7a43-1c3e-4b6e-9a58-0d2a4f6c8e01';
const T_HR = '5b0e7a43-1c3e-4b6e-9a58-0d2a4f6c8e02';
const T_LOST = '5b0e7a43-1c3e-4b6e-9a58-0d2a4f6c8e03';
const T_ADMIN = '5b0e7a43-1c3e-4b6e-9a58-0d2a4f6c8e04';
const PASSWORD = 'Kd7mPq2xRt9WnH4v';
const REASON = 'Only a super-admin can assign the admin role';
const HR_REASON = 'Only a super-admin can assign the hr-admin role';

const ok = (data: unknown, status = 200): ApiResponse => ({ ok: true, status, data });
const fail = (status: number, message: string): ApiResponse => ({ ok: false, status, message });

const options = (allowAdmin = false) => ({
  departments: [
    { id: 'g-eng', name: 'Engineering', path: '/Engineering' },
    { id: 'g-sales', name: 'Sales', path: '/Sales' },
  ],
  roles: [
    { name: 'member', allowed: true },
    { name: 'manager', allowed: true },
    allowAdmin
      ? { name: 'admin', allowed: true }
      : { name: 'admin', allowed: false, reason: REASON },
  ],
});

const item = (
  n: number,
  kind: 'GROUP_MEMBERSHIP' | 'ROLE' | 'MANUAL_TASK',
  targetRef: string | null,
  title = `Item ${n}`,
) => ({ id: `item-${n}`, title, description: null, kind, targetRef, position: n });

const developer = {
  id: T_DEV,
  name: 'Developer',
  description: null,
  departmentRef: '/Engineering',
  defaultRole: 'manager',
  items: [
    item(1, 'GROUP_MEMBERSHIP', '/Sales'),
    item(2, 'ROLE', 'developer'),
    item(3, 'MANUAL_TASK', null, 'Order laptop'),
  ],
};
const hr = {
  id: T_HR,
  name: 'HR',
  description: null,
  departmentRef: '/Engineering',
  defaultRole: 'member',
  items: [item(1, 'ROLE', 'hr-admin')],
};
const lost = {
  id: T_LOST,
  name: 'Overseas',
  description: null,
  departmentRef: '/Overseas',
  defaultRole: null,
  items: [],
};
const adminDefault = {
  id: T_ADMIN,
  name: 'Lead',
  description: null,
  departmentRef: '/Sales',
  defaultRole: 'admin',
  items: [],
};

const checklist = (status: 'open' | 'done' = 'open') => ({
  subjectId: SUBJECT_ID,
  status,
  createdAt: '2026-10-09T12:00:00.000Z',
  completedAt: null,
  templateName: 'Developer',
  person: { displayName: 'Ann Lee', username: 'ann.lee' },
  items: [
    {
      id: '00000000-0000-4000-8000-000000000011',
      title: 'Order laptop',
      description: null,
      status: status === 'done' ? 'done' : 'pending',
      position: 0,
      completedAt: null,
    },
  ],
});

function setup(
  config: {
    templates?: unknown[];
    templatesResponse?: () => Promise<ApiResponse>;
    allowAdmin?: boolean;
  } & FakeApiOptions = {},
) {
  const { templates = [developer, hr], templatesResponse, allowAdmin, ...rest } = config;
  return installFakeApi({
    auth: adminAuth,
    apiGet: async (path) => {
      if (path === '/onboarding/options') return ok(options(allowAdmin));
      if (path === '/templates')
        return templatesResponse ? templatesResponse() : ok({ items: templates });
      if (path === `/checklists/${SUBJECT_ID}`) return ok(checklist());
      return fail(404, 'not set up');
    },
    ...rest,
  });
}

const templateSelect = () => screen.findByLabelText('Template (optional)');

async function fillPerson() {
  await userEvent.type(await screen.findByLabelText('First name'), 'Ann');
  await userEvent.type(screen.getByLabelText('Last name'), 'Lee');
  await userEvent.type(screen.getByLabelText('Email'), 'ann@example.com');
  await userEvent.type(screen.getByLabelText('Username'), 'ann.lee');
}

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Onboard employee' }));

describe('Onboard form: choosing a template', () => {
  it('has no template field when there are no templates', async () => {
    setup({ templates: [] });
    renderWithProviders(<OnboardPage />);

    await screen.findByLabelText('Department');

    expect(screen.queryByLabelText('Template (optional)')).not.toBeInTheDocument();
  });

  it('offers "No template" first, then each template by name', async () => {
    setup();
    renderWithProviders(<OnboardPage />);

    const select = await templateSelect();
    const names = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);

    expect(names).toEqual(['No template', 'Developer', 'HR']);
    expect(select).toHaveValue('');
  });

  it('says templates are loading, and is disabled meanwhile', async () => {
    setup({ templatesResponse: () => new Promise<ApiResponse>(() => undefined) });
    renderWithProviders(<OnboardPage />);

    const select = await templateSelect();

    expect(select).toBeDisabled();
    expect(select).toHaveAccessibleDescription('Loading templates…');
  });

  it('says templates could not be loaded, and still lets the form be used', async () => {
    setup({ templatesResponse: async () => fail(403, 'no') });
    renderWithProviders(<OnboardPage />);

    const select = await templateSelect();

    await waitFor(() =>
      expect(select).toHaveAccessibleDescription(
        'Templates could not be loaded. You can still onboard without one.',
      ),
    );
    expect(screen.getByLabelText('Department')).toBeEnabled();
  });

  it('fills in the department and the role, says so in a status message, and lists what else the template does', async () => {
    setup();
    renderWithProviders(<OnboardPage />);

    await userEvent.selectOptions(await templateSelect(), T_DEV);

    expect(screen.getByLabelText('Department')).toHaveValue('g-eng');
    expect(screen.getByLabelText('Role')).toHaveValue('manager');
    expect(screen.getByRole('status', { name: '' })).toBeDefined();
    expect(
      screen.getByText('Department set to Engineering. Role set to Manager. You can change them.'),
    ).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'This template will also' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Add them to the group /Sales',
      'Assign the role developer',
      'Add the task "Order laptop" to their checklist',
    ]);
  });

  it('lets the admin change what the template filled in', async () => {
    setup();
    renderWithProviders(<OnboardPage />);
    await userEvent.selectOptions(await templateSelect(), T_DEV);

    await userEvent.selectOptions(screen.getByLabelText('Department'), 'g-sales');
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'member');

    expect(screen.getByLabelText('Department')).toHaveValue('g-sales');
    expect(screen.getByLabelText('Role')).toHaveValue('member');
    expect(screen.getByLabelText('Template (optional)')).toHaveValue(T_DEV);
  });

  it('goes back to no preview when "No template" is chosen again', async () => {
    setup();
    renderWithProviders(<OnboardPage />);
    const select = await templateSelect();
    await userEvent.selectOptions(select, T_DEV);

    await userEvent.selectOptions(select, '');

    expect(screen.queryByRole('list', { name: 'This template will also' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Department set to/)).not.toBeInTheDocument();
  });

  it('says so when the template names a department the identity provider does not have, and leaves the choice to the admin', async () => {
    setup({ templates: [lost] });
    renderWithProviders(<OnboardPage />);

    await userEvent.selectOptions(await templateSelect(), T_LOST);

    expect(screen.getByLabelText('Department')).toHaveValue('');
    expect(
      screen.getByText(
        /The template names the department \/Overseas, which is not in the identity provider/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('This template adds nothing beyond the department and role.'),
    ).toBeInTheDocument();
  });

  it('shows a template with nothing to add without a list', async () => {
    setup({ templates: [{ ...lost, departmentRef: '/Sales' }] });
    renderWithProviders(<OnboardPage />);

    await userEvent.selectOptions(await templateSelect(), T_LOST);

    expect(screen.getByLabelText('Department')).toHaveValue('g-sales');
    expect(screen.queryByRole('list', { name: 'This template will also' })).not.toBeInTheDocument();
  });

  it('describes an item that names no group or role instead of printing "null"', async () => {
    setup({
      templates: [
        { ...developer, items: [item(1, 'GROUP_MEMBERSHIP', null), item(2, 'ROLE', null)] },
      ],
    });
    renderWithProviders(<OnboardPage />);

    await userEvent.selectOptions(await templateSelect(), T_DEV);

    const list = screen.getByRole('list', { name: 'This template will also' });
    expect(list).toHaveTextContent('Add them to the group (no group named)');
    expect(list).toHaveTextContent('Assign the role (no role named)');
    expect(list).not.toHaveTextContent('null');
  });
});

describe('Onboard form: templates a person may not use', () => {
  it('disables a template with a privileged role for an hr-admin, and says which and why', async () => {
    setup();
    renderWithProviders(<OnboardPage />);

    const select = await templateSelect();

    expect(within(select).getByRole('option', { name: 'HR' })).toBeDisabled();
    expect(within(select).getByRole('option', { name: 'Developer' })).toBeEnabled();
    expect(select).toHaveAccessibleDescription(`Not available to you: HR (${HR_REASON}).`);
  });

  it('enables the same template, with no warning, for a super-admin', async () => {
    setup({ auth: superAdminAuth, allowAdmin: true });
    renderWithProviders(<OnboardPage />);

    const select = await templateSelect();

    expect(within(select).getByRole('option', { name: 'HR' })).toBeEnabled();
    expect(select).not.toHaveAccessibleDescription();
  });

  it('treats a template whose default role is admin as not available to an hr-admin, and available to a super-admin', async () => {
    setup({ templates: [adminDefault] });
    const first = renderWithProviders(<OnboardPage />);
    const blocked = await templateSelect();
    expect(within(blocked).getByRole('option', { name: 'Lead' })).toBeDisabled();
    first.unmount();

    setup({ templates: [adminDefault], auth: superAdminAuth, allowAdmin: true });
    renderWithProviders(<OnboardPage />);
    const select = await templateSelect();
    await userEvent.selectOptions(select, T_ADMIN);

    expect(screen.getByLabelText('Role')).toHaveValue('admin');
  });
});

describe('Onboard form: sending a template', () => {
  const created = (steps: unknown[], status = 'complete', code = 201) =>
    ok({ status, subjectId: SUBJECT_ID, steps, temporaryPassword: PASSWORD }, code);
  const base = [
    { name: 'create_user', status: 'done' },
    { name: 'add_to_group', status: 'done' },
    { name: 'assign_role', status: 'done' },
  ];

  it('sends the template id with what the template filled in', async () => {
    const api = setup({ onboardingCreate: async () => created(base) });
    renderWithProviders(<OnboardPage />);
    await fillPerson();
    await userEvent.selectOptions(screen.getByLabelText('Template (optional)'), T_DEV);

    await submit();

    await screen.findByText('Employee onboarded');
    expect(api.api.onboarding.create).toHaveBeenCalledWith({
      firstName: 'Ann',
      lastName: 'Lee',
      email: 'ann@example.com',
      username: 'ann.lee',
      departmentGroupId: 'g-eng',
      role: 'manager',
      templateId: T_DEV,
    });
    expect(screen.getByText('Template')).toBeInTheDocument();
    expect(screen.getAllByText('Developer').length).toBeGreaterThan(0);
  });

  it('sends no template id when none was chosen', async () => {
    const api = setup({ onboardingCreate: async () => created(base) });
    renderWithProviders(<OnboardPage />);
    await fillPerson();
    await userEvent.selectOptions(screen.getByLabelText('Department'), 'g-eng');

    await submit();

    await screen.findByText('Employee onboarded');
    const sent = api.api.onboarding.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent.templateId).toBeUndefined();
    expect(screen.queryByText('Template')).not.toBeInTheDocument();
  });

  it('shows the checklist under the steps when it was created, and ticking a task saves it', async () => {
    const tick = async () => ok({ ...checklist('done') });
    const api = setup({
      onboardingCreate: async () =>
        created([
          ...base,
          { name: 'template_assign_role', status: 'done', label: 'developer' },
          { name: 'create_checklist', status: 'done' },
        ]),
      checklistSetItem: tick,
    });
    renderWithProviders(<OnboardPage />);
    await fillPerson();
    await userEvent.selectOptions(screen.getByLabelText('Template (optional)'), T_DEV);
    await submit();

    const laptop = await screen.findByRole('checkbox', { name: 'Order laptop' });
    expect(
      screen.getByRole('heading', { level: 3, name: 'Checklist for the new employee' }),
    ).toBeInTheDocument();
    await userEvent.click(laptop);

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Order laptop' })).toBeChecked(),
    );
    expect(api.api.checklists.setItem).toHaveBeenCalledWith(
      SUBJECT_ID,
      '00000000-0000-4000-8000-000000000011',
      { done: true },
    );
    expect(screen.getByLabelText('Temporary password')).toHaveTextContent(PASSWORD);
    expect(screen.getByText('Create the checklist')).toBeInTheDocument();
  });

  it('does not ask for a checklist, and says when it will exist, while the steps are unfinished', async () => {
    const api = setup({
      onboardingCreate: async () =>
        created(
          [
            ...base,
            {
              name: 'template_add_to_group',
              status: 'failed',
              label: '/Sales',
              message: 'Group "/Sales" does not exist in the identity provider',
            },
            {
              name: 'create_checklist',
              status: 'skipped',
              message: 'Not run because an earlier step failed',
            },
          ],
          'partial',
          207,
        ),
    });
    renderWithProviders(<OnboardPage />);
    await fillPerson();
    await userEvent.selectOptions(screen.getByLabelText('Template (optional)'), T_DEV);
    await submit();

    expect(await screen.findByText('Onboarding is not finished')).toBeInTheDocument();
    expect(
      screen.getByText('The checklist is created once every step has finished.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(api.api.get).not.toHaveBeenCalledWith(`/checklists/${SUBJECT_ID}`, undefined);
  });

  it('repeats the template on Retry, then shows the checklist', async () => {
    let call = 0;
    const api = setup({
      onboardingCreate: async () =>
        created(
          [
            ...base,
            {
              name: 'template_assign_role',
              status: 'failed',
              label: 'ghost',
              message: 'Role "ghost" does not exist in the identity provider',
            },
            {
              name: 'create_checklist',
              status: 'skipped',
              message: 'Not run because an earlier step failed',
            },
          ],
          'partial',
          207,
        ),
      onboardingRetry: async () => {
        call += 1;
        return ok({
          status: 'complete',
          subjectId: SUBJECT_ID,
          steps: [
            { name: 'create_user', status: 'skipped', message: 'Already done' },
            { name: 'template_assign_role', status: 'done', label: 'ghost' },
            { name: 'create_checklist', status: 'done' },
          ],
        });
      },
    });
    renderWithProviders(<OnboardPage />);
    await fillPerson();
    await userEvent.selectOptions(screen.getByLabelText('Template (optional)'), T_DEV);
    await submit();
    await screen.findByText('Onboarding is not finished');

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('checkbox', { name: 'Order laptop' })).toBeInTheDocument();
    expect(call).toBe(1);
    expect(api.api.onboarding.retry).toHaveBeenCalledWith(SUBJECT_ID, {
      departmentGroupId: 'g-eng',
      role: 'manager',
      templateId: T_DEV,
    });
    expect(screen.getByLabelText('Temporary password')).toHaveTextContent(PASSWORD);
  });

  it('keeps the password out of the checklist: it is gone once the page is left', async () => {
    setup({
      onboardingCreate: async () =>
        created([...base, { name: 'create_checklist', status: 'done' }]),
    });
    const first = renderWithProviders(<OnboardPage />);
    await fillPerson();
    await userEvent.selectOptions(screen.getByLabelText('Template (optional)'), T_DEV);
    await submit();
    await screen.findByRole('checkbox', { name: 'Order laptop' });

    first.unmount();
    renderWithProviders(<OnboardPage />);

    await screen.findByLabelText('First name');
    expect(document.body).not.toHaveTextContent(PASSWORD);
  });

  it('links to the open checklists', async () => {
    setup();
    renderWithProviders(<OnboardPage />);

    expect(await screen.findByRole('link', { name: 'Open checklists' })).toHaveAttribute(
      'href',
      '/onboard/checklists',
    );
  });
});
