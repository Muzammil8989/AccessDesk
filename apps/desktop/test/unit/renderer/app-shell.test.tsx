import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageHeader } from '../../../src/renderer/src/components/page-header';
import { Avatar, initialsOf } from '../../../src/renderer/src/components/ui/avatar';
import { routes } from '../../../src/renderer/src/router';
import { adminAuth, installFakeApi, renderRoutes } from './helpers/render-app';

function stubViewport(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('app shell', () => {
  it('groups the menu and keeps Settings last', async () => {
    installFakeApi({ auth: adminAuth });
    renderRoutes(routes, '/onboard');
    await screen.findByRole('heading', { name: 'Onboard' });

    const menu = screen.getByRole('navigation', { name: 'Main' });
    const workforce = within(menu).getByRole('list', { name: 'Workforce' });
    const governance = within(menu).getByRole('list', { name: 'Governance' });
    expect(
      within(workforce)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Employees', 'Onboard', 'Offboard']);
    expect(
      within(governance)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Access Review', 'Audit Log']);
    expect(within(menu).getAllByRole('link').at(-1)).toHaveAccessibleName('Settings');
    expect(within(menu).getByRole('link', { name: 'Onboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows who is signed in with initials, and a Sign out button', async () => {
    installFakeApi({ auth: adminAuth });
    renderRoutes(routes, '/onboard');

    expect(await screen.findByText('Hana HR')).toBeInTheDocument();
    expect(screen.getByText('HH')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('collapses to icons and back, keeping every link named', async () => {
    const user = userEvent.setup();
    installFakeApi({ auth: adminAuth });
    renderRoutes(routes, '/onboard');
    await screen.findByRole('heading', { name: 'Onboard' });

    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);
    const expand = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: 'Employees' })).toBeInTheDocument();
    expect(screen.getByText('Employees', { selector: 'span' })).toHaveClass('sr-only');
    expect(screen.getByRole('link', { name: 'Offboard' })).not.toHaveAttribute('title');
    // The tooltip trigger once turned the link's class function into text, unstyling it.
    expect(screen.getByRole('link', { name: 'Employees' }).className).not.toMatch(/=>|isActive/);
    expect(screen.getByRole('link', { name: 'Onboard' })).toHaveClass(
      'rounded-lg',
      'bg-primary/10',
    );

    await user.hover(screen.getByRole('link', { name: 'Offboard' }));
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Offboard');
    expect(tip).toHaveTextContent('Soon');
    await user.unhover(screen.getByRole('link', { name: 'Offboard' }));

    await user.click(expand);
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
    expect(screen.getByText('Employees', { selector: 'span' })).not.toHaveClass('sr-only');
  });

  it('shows no tooltip on a link while its label is on screen', async () => {
    const user = userEvent.setup();
    installFakeApi({ auth: adminAuth });
    renderRoutes(routes, '/onboard');
    await screen.findByRole('heading', { name: 'Onboard' });

    await user.hover(screen.getByRole('link', { name: 'Employees' }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('toggles with Ctrl+B, but not while typing', async () => {
    const user = userEvent.setup();
    installFakeApi({ auth: adminAuth });
    renderRoutes(routes, '/settings');
    await screen.findByLabelText('Issuer URL');

    await user.keyboard('{Control>}b{/Control}');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();

    await user.click(screen.getByLabelText('Issuer URL'));
    await user.keyboard('{Control>}b{/Control}');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('remembers the choice for the next launch', async () => {
    const user = userEvent.setup();
    installFakeApi({ auth: adminAuth });
    const first = renderRoutes(routes, '/onboard');
    await screen.findByRole('heading', { name: 'Onboard' });
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    first.unmount();

    renderRoutes(routes, '/onboard');
    await screen.findByRole('heading', { name: 'Onboard' });
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('starts icon-only in a narrow window, and the user can still expand it', async () => {
    const user = userEvent.setup();
    stubViewport(true);
    installFakeApi({ auth: adminAuth });
    renderRoutes(routes, '/onboard');
    await screen.findByRole('heading', { name: 'Onboard' });

    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
  });

  it('lets keyboard users skip the menu', async () => {
    const user = userEvent.setup();
    installFakeApi({ auth: adminAuth });
    renderRoutes(routes, '/onboard');
    await screen.findByRole('heading', { name: 'Onboard' });

    await user.click(screen.getByRole('link', { name: 'Skip to main content' }));
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('shows a skeleton, not a blank page, while the session loads', async () => {
    const api = installFakeApi({ auth: adminAuth });
    api.settings.get.mockImplementation(() => new Promise(() => undefined));
    renderRoutes(routes, '/employees');

    expect(await screen.findByRole('status', { name: 'Loading AccessDesk' })).toBeInTheDocument();
  });

  it('shows a skeleton on the sign-in page while the session loads', async () => {
    const api = installFakeApi({ auth: adminAuth });
    api.auth.status.mockImplementation(() => new Promise(() => undefined));
    renderRoutes(routes, '/login');

    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});

describe('PageHeader', () => {
  it('renders the title as the page heading, with description and actions', () => {
    render(
      <PageHeader title="Employees" description="Everyone." actions={<button>Export</button>} />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Employees' })).toBeInTheDocument();
    expect(screen.getByText('Everyone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('omits the description and actions when not given', () => {
    render(<PageHeader title="Settings" />);
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('Avatar', () => {
  it.each([
    ['Hana HR', 'HH'],
    ['Ann Marie Lee', 'AL'],
    ['superadmin1', 'SU'],
    ['  ', '?'],
    ['', '?'],
  ])('shows %j as %s', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });

  it('is decorative', () => {
    render(<Avatar name="Hana HR" />);
    expect(screen.getByText('HH')).toHaveAttribute('aria-hidden', 'true');
  });
});
