import { zodResolver } from '@hookform/resolvers/zod';
import { appSettingsSchema, type AppSettings } from '@accessdesk/shared';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import type { ConnectionTestResult } from '../../../shared/ipc';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';

type FormInput = z.input<typeof appSettingsSchema>;

// Public values that match .env.example. Nothing secret is ever asked for here.
const DEFAULTS: FormInput = {
  keycloakUrl: 'http://localhost:8080',
  realm: 'company-platform',
  clientId: 'accessdesk',
  apiUrl: 'http://localhost:4000',
};

interface SettingsFormProps {
  initial: AppSettings | null;
  submitLabel: string;
  onSaved?: (settings: AppSettings) => void;
}

export function SettingsForm({ initial, submitLabel, onSaved }: SettingsFormProps) {
  const queryClient = useQueryClient();
  const form = useForm<FormInput, unknown, AppSettings>({
    resolver: zodResolver(appSettingsSchema),
    defaultValues: initial ?? DEFAULTS,
  });
  const { errors, isSubmitting } = form.formState;
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function onSubmit(values: AppSettings) {
    setSaveError(null);
    const result = await window.accessdesk.settings.save(values);
    if (!result.ok) return setSaveError(result.message);
    // Changing realm or client signs the user out, so refresh everything that depends on it.
    await queryClient.invalidateQueries();
    onSaved?.(result.settings);
  }

  async function testConnection() {
    if (!(await form.trigger())) return;
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await window.accessdesk.settings.testConnection(form.getValues()));
    } finally {
      setTesting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
      className="flex flex-col gap-5"
      noValidate
    >
      <FormField
        id="keycloakUrl"
        label="Keycloak URL"
        hint="Where your Keycloak server is reachable, for example https://sso.example.com"
        error={errors.keycloakUrl}
        {...form.register('keycloakUrl')}
      />
      <FormField
        id="realm"
        label="Realm"
        error={errors.realm}
        autoComplete="off"
        {...form.register('realm')}
      />
      <FormField
        id="clientId"
        label="Client ID"
        hint="A public client with Standard flow and PKCE. It needs no secret."
        error={errors.clientId}
        autoComplete="off"
        {...form.register('clientId')}
      />
      <FormField
        id="apiUrl"
        label="AccessDesk API URL"
        error={errors.apiUrl}
        {...form.register('apiUrl')}
      />

      {testResult && (
        <p
          role="status"
          className={`flex items-center gap-2 text-sm ${testResult.ok ? 'text-success' : 'text-destructive'}`}
        >
          {testResult.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
          {testResult.message}
        </p>
      )}
      {saveError && (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void testConnection()}
          disabled={testing}
        >
          {testing ? 'Testing…' : 'Test connection'}
        </Button>
      </div>
    </form>
  );
}
