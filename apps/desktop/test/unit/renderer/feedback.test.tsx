import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsForm } from '../../../src/renderer/src/components/settings-form';
import { Toaster } from '../../../src/renderer/src/components/toaster';
import { clearToasts, toast } from '../../../src/renderer/src/lib/toast';
import { routes } from '../../../src/renderer/src/router';
import {
  adminAuth,
  installFakeApi,
  memberAuth,
  renderRoutes,
  renderWithProviders,
  settings,
  signedOut,
} from './helpers/render-app';

afterEach(() => {
  clearToasts();
  vi.useRealTimers();
});

describe('toasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('announces a routine notice politely and drops it after a few seconds', () => {
    render(<Toaster />);

    act(() => {
      toast.success('Settings saved');
    });

    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(
      within(screen.getAllByRole('status')[0]!).getByText('Settings saved'),
    ).toBeInTheDocument();
    expect(region).toHaveTextContent('Settings saved');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('Settings saved')).not.toBeInTheDocument();
  });

  it('keeps an error until it is dismissed, and announces it as an alert', () => {
    render(<Toaster />);

    act(() => {
      toast.error('Could not sign out. Try again.');
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not sign out. Try again.');

    fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Could not sign out. Try again.')).not.toBeInTheDocument();
  });

  it('shows at most four at a time, newest last', () => {
    render(<Toaster />);

    act(() => {
      for (let n = 1; n <= 6; n += 1) toast.info(`Notice ${n}`);
    });

    expect(screen.queryByText('Notice 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Notice 2')).not.toBeInTheDocument();
    expect(screen.getByText('Notice 3')).toBeInTheDocument();
    expect(screen.getByText('Notice 6')).toBeInTheDocument();
  });

  it('ignores the timer of a notice that was already dismissed', () => {
    render(<Toaster />);
    act(() => {
      toast.success('Once');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    expect(() => act(() => vi.advanceTimersByTime(10_000))).not.toThrow();
    expect(screen.queryByText('Once')).not.toBeInTheDocument();
  });

  it('has the two live regions in the page before anything is shown, so the first notice is read', () => {
    render(<Toaster />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });
});

describe('where toasts are used', () => {
  it('confirms that settings were saved', async () => {
    installFakeApi();
    render(<Toaster />);
    renderWithProviders(<SettingsForm initial={settings} submitLabel="Save" />);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Settings saved')).toBeInTheDocument();
  });

  it('does not confirm a save that failed', async () => {
    installFakeApi({ saveSettings: async () => ({ ok: false, message: 'Disk is read-only' }) });
    render(<Toaster />);
    renderWithProviders(<SettingsForm initial={settings} submitLabel="Save" />);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Disk is read-only')).toBeInTheDocument();
    expect(screen.queryByText('Settings saved')).not.toBeInTheDocument();
  });

  it('tells the admin when signing out did not work', async () => {
    const api = installFakeApi({ auth: adminAuth });
    api.auth.logout.mockRejectedValue(new Error('bridge crashed'));
    render(<Toaster />);
    renderRoutes(routes, '/employees');

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));

    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Notifications' })).getByRole('alert'),
      ).toHaveTextContent('Could not sign out. Try again.'),
    );
  });

  it('tells a user without access when signing out did not work', async () => {
    const api = installFakeApi({ auth: memberAuth });
    api.auth.logout.mockRejectedValue(new Error('bridge crashed'));
    render(<Toaster />);
    renderRoutes(routes, '/no-access');

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));

    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Notifications' })).getByRole('alert'),
      ).toHaveTextContent('Could not sign out. Try again.'),
    );
  });
});

describe('screens that are not built yet', () => {
  it.each([
    ['/offboard', 'Offboard'],
    ['/access-review', 'Access Review'],
    ['/audit-log', 'Audit Log'],
  ])('%s says what it is and offers a way back', async (path, title) => {
    installFakeApi({ auth: adminAuth });
    renderRoutes(routes, path);

    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(screen.getByText('This screen is not built yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the employee list' })).toHaveAttribute(
      'href',
      '/employees',
    );
  });
});

describe('page headings', () => {
  it('gives the standalone card pages a real h1', async () => {
    installFakeApi({ auth: signedOut });
    renderRoutes(routes, '/login');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to AccessDesk' }),
    ).toBeInTheDocument();
  });

  it('keeps h2 for cards inside a page', async () => {
    installFakeApi({ auth: adminAuth });
    renderRoutes(routes, '/settings');

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Identity provider connection' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });
});
