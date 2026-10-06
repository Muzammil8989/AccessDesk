import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsForm } from '../../../src/renderer/src/components/settings-form';
import { installFakeApi, renderWithProviders, settings } from './helpers/render-app';

describe('connection settings form', () => {
  it('starts from the saved values', async () => {
    installFakeApi();
    renderWithProviders(<SettingsForm initial={settings} submitLabel="Save" />);

    expect(screen.getByLabelText('Keycloak URL')).toHaveValue('http://localhost:8080');
    expect(screen.getByLabelText('Realm')).toHaveValue('company-platform');
    expect(screen.getByLabelText('Client ID')).toHaveValue('accessdesk');
  });

  it('never asks for a secret or a password', () => {
    installFakeApi();
    renderWithProviders(<SettingsForm initial={null} submitLabel="Save" />);

    expect(screen.queryByLabelText(/secret|password/i)).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it('shows a message and does not save when a value is invalid', async () => {
    const api = installFakeApi();
    renderWithProviders(<SettingsForm initial={settings} submitLabel="Save" />);

    const url = screen.getByLabelText('Keycloak URL');
    await userEvent.clear(url);
    await userEvent.type(url, 'not-a-url');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(url).toHaveAttribute('aria-invalid', 'true');
    expect(api.settings.save).not.toHaveBeenCalled();
  });

  it('rejects a realm that could change a URL path', async () => {
    const api = installFakeApi();
    renderWithProviders(<SettingsForm initial={settings} submitLabel="Save" />);

    const realm = screen.getByLabelText('Realm');
    await userEvent.clear(realm);
    await userEvent.type(realm, '../master');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(realm).toHaveAttribute('aria-invalid', 'true'));
    expect(api.settings.save).not.toHaveBeenCalled();
  });

  it('saves cleaned-up values (no trailing slash) and reports back', async () => {
    const api = installFakeApi();
    const onSaved = vi.fn();
    renderWithProviders(<SettingsForm initial={settings} submitLabel="Save" onSaved={onSaved} />);

    const url = screen.getByLabelText('Keycloak URL');
    await userEvent.clear(url);
    await userEvent.type(url, 'https://sso.example.com/');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.settings.save).toHaveBeenCalledWith(
      expect.objectContaining({ keycloakUrl: 'https://sso.example.com' }),
    );
  });

  it('shows the main process error when saving fails', async () => {
    installFakeApi({ saveSettings: async () => ({ ok: false, message: 'Disk is read-only' }) });
    renderWithProviders(<SettingsForm initial={settings} submitLabel="Save" />);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Disk is read-only')).toBeInTheDocument();
  });

  it('reports a successful and a failed connection test', async () => {
    const results = [
      { ok: true, message: 'Connected to realm "company-platform"' },
      { ok: false, message: 'Could not reach Keycloak at http://localhost:8080' },
    ];
    installFakeApi({ testConnection: async () => results.shift()! });
    renderWithProviders(<SettingsForm initial={settings} submitLabel="Save" />);

    await userEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Connected to realm');

    await userEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Could not reach Keycloak'),
    );
  });
});
