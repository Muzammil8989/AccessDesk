import { zodResolver } from '@hookform/resolvers/zod';
import {
  ADMIN_ROLE_REASON,
  onboardEmployeeSchema,
  type Employee,
  type OnboardEmployee,
  type OnboardEmployeeInput,
  type OnboardingOptions,
  type Template,
} from '@accessdesk/shared';
import {
  Building2,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  KeyRound,
  ListChecks,
  Loader2,
  RotateCcw,
  ShieldCheck,
  UserPlus,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useForm, useWatch, type Control } from 'react-hook-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MANAGER_FIELD_ID, ManagerPicker, nameOfEmployee } from '@/components/manager-picker';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { SelectField } from '@/components/ui/select-field';
import { START_DATE_NOTE, formatDay } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface SubmitFailure {
  field?: 'username' | 'email' | 'managerSubjectId';
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
  onSubmit: (
    values: OnboardEmployee,
    details: { managerName?: string },
  ) => Promise<SubmitFailure | null>;
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
  managerSubjectId: undefined,
  startDate: undefined,
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
  { name: 'managerSubjectId', label: 'Manager' },
  { name: 'startDate', label: 'Start date' },
];

const ITEM_ICONS: Record<Template['items'][number]['kind'], LucideIcon> = {
  GROUP_MEMBERSHIP: Users,
  ROLE: ShieldCheck,
  MANUAL_TASK: ListChecks,
};

/**
 * One block of the form. The `<h2>` names the group (`aria-labelledby`), so the description
 * below it stays out of the group's name.
 */
function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <fieldset
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="min-w-0 rounded-xl border bg-card text-card-foreground shadow-xs"
    >
      <div className="flex items-start gap-3 border-b px-6 py-4">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm font-semibold">
            {title}
          </h2>
          <p id={descriptionId} className="text-sm text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-5 p-6">{children}</div>
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
    <div className="rounded-lg border border-info/30 bg-info/5 p-4 text-sm">
      <p id={headingId} className="font-medium">
        This template will also
      </p>
      <ul aria-labelledby={headingId} className="mt-2 flex flex-col gap-1.5">
        {template.items.map((item) => {
          const Icon = ITEM_ICONS[item.kind];
          return (
            <li key={item.id} className="flex items-start gap-2 text-muted-foreground">
              <Icon className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
              <span className="min-w-0 break-words">{describeItem(item)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'min-w-0 truncate text-right',
          value ? 'font-medium' : 'text-muted-foreground/80',
        )}
      >
        {value || 'Not set'}
      </dd>
    </div>
  );
}

/** A live preview of what will be created, so the admin can check it before submitting. */
function OnboardSummary({
  control,
  options,
  templates,
  manager,
  actions,
}: {
  control: Control<OnboardEmployeeInput, unknown, OnboardEmployee>;
  options: OnboardingOptions;
  templates: Template[];
  manager: Employee | null;
  actions: ReactNode;
}) {
  const values = useWatch({ control });
  const fullName = [values.firstName, values.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  const department = options.departments.find((item) => item.id === values.departmentGroupId);
  const template = templates.find((item) => item.id === values.templateId);
  const role = values.role ? ROLE_LABELS[values.role] : undefined;
  const extraSteps = template?.items.filter((item) => item.kind !== 'MANUAL_TASK').length ?? 0;
  const tasks = template?.items.filter((item) => item.kind === 'MANUAL_TASK').length ?? 0;
  const checklist = tasks > 0 || Boolean(manager) || Boolean(values.startDate);

  const next = [
    'Create the account and enable it now',
    `Add them to ${department?.name ?? 'the department'} as ${role ?? 'a member'}`,
    ...(extraSteps > 0
      ? [`Apply ${extraSteps} more ${extraSteps === 1 ? 'group or role' : 'groups and roles'}`]
      : []),
    ...(checklist
      ? [
          tasks > 0
            ? `Create a checklist with ${tasks} ${tasks === 1 ? 'task' : 'tasks'}`
            : 'Create a checklist',
        ]
      : []),
    'Show a one-time temporary password to hand over',
  ];

  return (
    <aside aria-labelledby="onboard-summary-title" className="flex flex-col gap-4">
      <div className="rounded-xl border bg-card text-card-foreground shadow-xs">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <Avatar name={fullName} className="size-11 text-sm" />
          <div className="min-w-0">
            <h2 id="onboard-summary-title" className="text-xs font-medium text-muted-foreground">
              Summary
            </h2>
            <p className={cn('truncate font-semibold', !fullName && 'text-muted-foreground')}>
              {fullName || 'New employee'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {values.email?.trim() || 'No email yet'}
            </p>
          </div>
        </div>
        <dl className="divide-y px-5 py-1 text-sm">
          <SummaryRow label="Username" value={values.username?.trim()} />
          <SummaryRow label="Department" value={department?.name} />
          <SummaryRow label="Role" value={role} />
          <SummaryRow label="Template" value={template?.name} />
          <SummaryRow label="Manager" value={manager ? nameOfEmployee(manager) : undefined} />
          <SummaryRow
            label="Start date"
            value={values.startDate ? formatDay(values.startDate) : undefined}
          />
        </dl>
        <div className="flex flex-col gap-2 border-t p-5">{actions}</div>
      </div>

      <div className="rounded-xl border bg-card p-5 text-card-foreground shadow-xs">
        <h3 id="onboard-next-title" className="text-sm font-semibold">
          What happens next
        </h3>
        <ol aria-labelledby="onboard-next-title" className="mt-3 flex flex-col gap-2.5 text-sm">
          {next.map((step) => (
            <li key={step} className="flex items-start gap-2.5 text-muted-foreground">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </aside>
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
  const { errors, isSubmitting, isDirty } = form.formState;
  const [formError, setFormError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [invalidAttempts, setInvalidAttempts] = useState(0);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  const [manager, setManager] = useState<Employee | null>(null);
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
    const failure = await onSubmit(values, {
      managerName: manager ? nameOfEmployee(manager) : undefined,
    });
    if (!failure) return;
    if (failure.field === 'managerSubjectId') {
      form.setError('managerSubjectId', { type: 'server', message: failure.message });
      document.getElementById(MANAGER_FIELD_ID)?.focus();
    } else if (failure.field) {
      form.setError(
        failure.field,
        { type: 'server', message: failure.message },
        { shouldFocus: true },
      );
    } else setFormError(failure.message);
  }

  function focusField(name: keyof OnboardEmployeeInput) {
    if (name === 'managerSubjectId') document.getElementById(MANAGER_FIELD_ID)?.focus();
    else form.setFocus(name);
  }

  function chooseManager(employee: Employee | null) {
    setManager(employee);
    form.setValue('managerSubjectId', employee?.id, { shouldDirty: true, shouldValidate: true });
    if (employee) form.clearErrors('managerSubjectId');
  }

  function rejected() {
    setShowSummary(true);
    setInvalidAttempts((count) => count + 1);
  }

  function clearForm() {
    form.reset(DEFAULT_VALUES);
    setManager(null);
    setPrefillNote(null);
    setFormError(null);
    setShowSummary(false);
    // The Clear button disables itself once the form is empty, so put focus somewhere useful.
    document.getElementById('firstName')?.focus();
  }

  return (
    <form
      onSubmit={(event) => void form.handleSubmit(submit, rejected)(event)}
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]"
      noValidate
    >
      <div className="flex min-w-0 flex-col gap-6">
        {invalidFields.length > 0 && (
          <div
            ref={summaryRef}
            role="group"
            tabIndex={-1}
            aria-labelledby="onboard-errors-title"
            className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0">
              <p id="onboard-errors-title" className="font-medium text-destructive">
                Fix these fields to continue
              </p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {invalidFields.map((field) => (
                  <li key={field.name}>
                    <button
                      type="button"
                      onClick={() => focusField(field.name)}
                      className="cursor-pointer rounded-sm text-foreground underline underline-offset-4 outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {field.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <Section
          icon={UserRound}
          title="Who they are"
          description="Their name and work email, as they appear in the directory."
        >
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

        <Section
          icon={KeyRound}
          title="Sign-in details"
          description="The username they sign in with. A temporary password is created for you."
        >
          <FormField
            id="username"
            label="Username"
            hint="Lowercase letters, numbers, dots, dashes or underscores"
            autoComplete="off"
            error={errors.username}
            {...form.register('username')}
          />
        </Section>

        <Section
          icon={Building2}
          title="Where they work"
          description="A template fills in the department and role, and can add groups, roles and tasks."
        >
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

        <Section
          icon={CalendarDays}
          title="Team and start"
          description="Optional. Both are saved on the onboarding checklist."
        >
          <ManagerPicker
            selected={manager}
            onSelect={chooseManager}
            error={errors.managerSubjectId}
          />
          <FormField
            id="startDate"
            label="Start date (optional)"
            type="date"
            hint={START_DATE_NOTE}
            error={errors.startDate}
            {...form.register('startDate', {
              setValueAs: (value: string) => (value ? value : undefined),
            })}
          />
        </Section>
      </div>

      {/* On wide windows the summary and the actions stay in view while the form scrolls, so
          nothing has to float over the fields. */}
      <div className="xl:sticky xl:top-6">
        <OnboardSummary
          control={form.control}
          options={options}
          templates={templates}
          manager={manager}
          actions={
            <>
              {formError && (
                <Alert variant="destructive" role="alert">
                  <AlertTitle>Could not create the account</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
                {isSubmitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
                {isSubmitting ? 'Creating…' : 'Onboard employee'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={clearForm}
                disabled={isSubmitting || (!isDirty && !manager)}
              >
                <RotateCcw />
                Clear form
              </Button>
            </>
          }
        />
      </div>
    </form>
  );
}
