import { zodResolver } from '@hookform/resolvers/zod';
import { appSettingsSchema, type AppSettings } from '@accessdesk/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import type { ConnectionTestResult } from '../../../shared/ipc';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { toast } from '@/lib/toast';

type FormInput = z.input<typeof appSettingsSchema>;

const DEFAULTS: FormInput = {
  issuerUrl: 'http://localhost:8080/realms/company-platform',
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
    await queryClient.invalidateQueries();
    toast.success('Settings saved');
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
        id="issuerUrl"
        label="Issuer URL"
        hint="The OpenID Connect issuer of your identity provider, for example https://sso.example.com/realms/company"
        error={errors.issuerUrl}
        {...form.register('issuerUrl')}
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
        <Alert variant={testResult.ok ? 'success' : 'destructive'} role="status">
          <AlertDescription className="mt-0 text-foreground">{testResult.message}</AlertDescription>
        </Alert>
      )}
      {saveError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="mt-0 text-foreground">{saveError}</AlertDescription>
        </Alert>
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
