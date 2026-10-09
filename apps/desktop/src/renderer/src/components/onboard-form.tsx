import { zodResolver } from '@hookform/resolvers/zod';
import {
  ADMIN_ROLE_REASON,
  onboardEmployeeSchema,
  type OnboardEmployee,
  type OnboardEmployeeInput,
  type OnboardingOptions,
  type Template,
} from '@accessdesk/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { SelectField } from '@/components/ui/select-field';

export interface SubmitFailure {
  field?: 'username' | 'email';
  message: string;
}

export type TemplatesState = 'loading' | 'error' | 'ready';

interface OnboardFormProps {
  options: OnboardingOptions;
  canAssignAdmin: boolean;
  templates: Template[];
  templatesState: TemplatesState;
  /** Why this person may not use a template, or null. The API enforces the same rule. */
  templateBlockedReason: (template: Template) => string | null;
  onSubmit: (values: OnboardEmployee) => Promise<SubmitFailure | null>;
}

const ROLE_LABELS: Record<OnboardingOptions['roles'][number]['name'], string> = {
  member: 'Member',
  manager: 'Manager',
  admin: 'Admin',
};

const DEFAULT_VALUES: OnboardEmployeeInput = {
  firstName: '',
  lastName: '',
  email: '',
  username: '',
  departmentGroupId: '',
  role: 'member',
  templateId: undefined,
};

/** The fields in page order, for the error summary. The summary lists labels, not messages. */
const FIELDS: { name: keyof OnboardEmployeeInput; label: string }[] = [
  { name: 'firstName', label: 'First name' },
  { name: 'lastName', label: 'Last name' },
  { name: 'email', label: 'Email' },
  { name: 'username', label: 'Username' },
  { name: 'templateId', label: 'Template' },
  { name: 'departmentGroupId', label: 'Department' },
  { name: 'role', label: 'Role' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-5">
      <legend className="mb-4 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function describeItem(item: Template['items'][number]): string {
  switch (item.kind) {
    case 'GROUP_MEMBERSHIP':
      return `Add them to the group ${item.targetRef ?? '(no group named)'}`;
    case 'ROLE':
      return `Assign the role ${item.targetRef ?? '(no role named)'}`;
    case 'MANUAL_TASK':
      return `Add the task "${item.title}" to their checklist`;
  }
}

function TemplatePreview({ template }: { template: Template }) {
  const headingId = 'template-preview-title';
  if (template.items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        This template adds nothing beyond the department and role.
      </p>
    );
  }
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <p id={headingId} className="font-medium">
        This template will also
      </p>
      <ul aria-labelledby={headingId} className="mt-1 list-disc pl-5 text-muted-foreground">
        {template.items.map((item) => (
          <li key={item.id}>{describeItem(item)}</li>
        ))}
      </ul>
    </div>
  );
}

export function OnboardForm({
  options,
  canAssignAdmin,
  templates,
  templatesState,
  templateBlockedReason,
  onSubmit,
}: OnboardFormProps) {
  const form = useForm<OnboardEmployeeInput, unknown, OnboardEmployee>({
    resolver: zodResolver(onboardEmployeeSchema),
    defaultValues: DEFAULT_VALUES,
    // The summary takes focus on a failed submit; each field is one link away.
    shouldFocusError: false,
  });
  const { errors, isSubmitting } = form.formState;
  const [formError, setFormError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [invalidAttempts, setInvalidAttempts] = useState(0);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (invalidAttempts > 0) summaryRef.current?.focus();
  }, [invalidAttempts]);

  const roles = options.roles.map((role) => ({
    ...role,
    disabled: !role.allowed || (role.name === 'admin' && !canAssignAdmin),
  }));
  const blocked = roles.find((role) => role.disabled);
  const selectedTemplateId = useWatch({ control: form.control, name: 'templateId' });
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const unavailable = templates.flatMap((template) => {
    const reason = templateBlockedReason(template);
    return reason ? [{ template, reason }] : [];
  });
  const showTemplates = templatesState !== 'ready' || templates.length > 0;

  let templateHint: string | undefined;
  if (templatesState === 'loading') templateHint = 'Loading templates…';
  else if (templatesState === 'error') {
    templateHint = 'Templates could not be loaded. You can still onboard without one.';
  } else if (unavailable.length > 0) {
    templateHint = `Not available to you: ${unavailable
      .map(({ template, reason }) => `${template.name} (${reason})`)
      .join('; ')}.`;
  }

  function applyTemplate(templateId: string) {
    const template = templates.find((candidate) => candidate.id === templateId);
    if (!template) {
      setPrefillNote(null);
      return;
    }
    const notes: string[] = [];
    if (template.departmentRef) {
      const department = options.departments.find((item) => item.path === template.departmentRef);
      if (department) {
        form.setValue('departmentGroupId', department.id, {
          shouldDirty: true,
          shouldValidate: true,
        });
        notes.push(`Department set to ${department.name}`);
      } else {
        notes.push(
          `The template names the department ${template.departmentRef}, which is not in the identity provider. Choose a department yourself`,
        );
      }
    }
    const role = roles.find((candidate) => candidate.name === template.defaultRole);
    if (role && !role.disabled) {
      form.setValue('role', role.name, { shouldDirty: true, shouldValidate: true });
      notes.push(`Role set to ${ROLE_LABELS[role.name]}`);
    }
    setPrefillNote(notes.length > 0 ? `${notes.join('. ')}. You can change them.` : null);
  }
  const invalidFields = showSummary ? FIELDS.filter((field) => errors[field.name]) : [];

  async function submit(values: OnboardEmployee) {
    setShowSummary(false);
    setFormError(null);
    const failure = await onSubmit(values);
    if (!failure) return;
    if (failure.field) {
      form.setError(
        failure.field,
        { type: 'server', message: failure.message },
        { shouldFocus: true },
      );
    } else setFormError(failure.message);
  }

  function rejected() {
    setShowSummary(true);
    setInvalidAttempts((count) => count + 1);
  }

  return (
    <form
      onSubmit={(event) => void form.handleSubmit(submit, rejected)(event)}
      className="flex flex-col gap-8"
      noValidate
    >
      {invalidFields.length > 0 && (
        <div
          ref={summaryRef}
          role="group"
          tabIndex={-1}
          aria-labelledby="onboard-errors-title"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p id="onboard-errors-title" className="font-medium text-destructive">
            Fix these fields to continue
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {invalidFields.map((field) => (
              <li key={field.name}>
                <button
                  type="button"
                  onClick={() => form.setFocus(field.name)}
                  className="cursor-pointer rounded-sm text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {field.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Section title="Who they are">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="firstName"
            label="First name"
            autoComplete="off"
            error={errors.firstName}
            {...form.register('firstName')}
          />
          <FormField
            id="lastName"
            label="Last name"
            autoComplete="off"
            error={errors.lastName}
            {...form.register('lastName')}
          />
        </div>
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="off"
          error={errors.email}
          {...form.register('email')}
        />
      </Section>

      <Section title="Sign-in details">
        <FormField
          id="username"
          label="Username"
          hint="Lowercase letters, numbers, dots, dashes or underscores"
          autoComplete="off"
          error={errors.username}
          {...form.register('username')}
        />
      </Section>

      <Section title="Where they work">
        {showTemplates && (
          <div className="flex flex-col gap-3">
            <SelectField
              id="templateId"
              label="Template (optional)"
              hint={templateHint}
              error={errors.templateId}
              disabled={templatesState === 'loading'}
              {...form.register('templateId', {
                setValueAs: (value: string) => (value ? value : undefined),
                onChange: (event: { target: { value: string } }) =>
                  applyTemplate(event.target.value),
              })}
            >
              <option value="">No template</option>
              {templates.map((template) => (
                <option
                  key={template.id}
                  value={template.id}
                  disabled={templateBlockedReason(template) !== null}
                >
                  {template.name}
                </option>
              ))}
            </SelectField>
            {prefillNote && (
              <p role="status" className="text-xs text-muted-foreground">
                {prefillNote}
              </p>
            )}
            {selectedTemplate && <TemplatePreview template={selectedTemplate} />}
          </div>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            id="departmentGroupId"
            label="Department"
            error={errors.departmentGroupId}
            {...form.register('departmentGroupId')}
          >
            <option value="">Select a department</option>
            {options.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="role"
            label="Role"
            hint={blocked ? (blocked.reason ?? ADMIN_ROLE_REASON) : undefined}
            error={errors.role}
            {...form.register('role')}
          >
            {roles.map((role) => (
              <option key={role.name} value={role.name} disabled={role.disabled}>
                {ROLE_LABELS[role.name]}
              </option>
            ))}
          </SelectField>
        </div>
      </Section>

      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Could not create the account</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end border-t pt-6">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Onboard employee'}
        </Button>
      </div>
    </form>
  );
}
