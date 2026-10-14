import type { OnboardResult, OnboardStep, OnboardingStepName } from '@accessdesk/shared';
import {
  Check,
  ChevronRight,
  CircleCheck,
  CircleMinus,
  CircleX,
  Copy,
  Eye,
  EyeOff,
  RotateCw,
  TriangleAlert,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChecklistPanel } from '@/components/checklist-panel';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { START_DATE_NOTE_SAVED, formatDay } from '@/lib/format';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

export interface OnboardSummary {
  name: string;
  username: string;
  email: string;
  departmentName: string;
  role: string;
  templateName?: string;
  managerName?: string;
  startDate?: string;
}

interface OnboardResultViewProps {
  result: OnboardResult;
  summary: OnboardSummary;
  password: string | null;
  retrying: boolean;
  retryError: string | null;
  onRetry: () => void;
  onReset: () => void;
}

const STEP_LABELS: Record<OnboardingStepName, string> = {
  create_user: 'Create the account',
  add_to_group: 'Add to the department',
  assign_role: 'Assign the role',
  template_add_to_group: 'Add to the template group',
  template_assign_role: 'Assign the template role',
  create_checklist: 'Create the checklist',
};

const STATUS_BADGES: Record<
  OnboardStep['status'],
  { label: string; variant: 'success' | 'destructive' | 'secondary'; icon: LucideIcon }
> = {
  done: { label: 'Done', variant: 'success', icon: CircleCheck },
  failed: { label: 'Failed', variant: 'destructive', icon: CircleX },
  skipped: { label: 'Skipped', variant: 'secondary', icon: CircleMinus },
};

/** The step icon is drawn bare, with no background: only its colour tells the states apart. */
const STEP_ICON_COLOURS: Record<OnboardStep['status'], string> = {
  done: 'text-success',
  failed: 'text-error',
  skipped: 'text-on-surface-variant',
};

/** How long "Copied" stays before the button goes back to "Copy". */
const COPIED_RESET_MS = 3000;

type CopyKind = 'password' | 'details';

function PasswordBlock({ username, password }: { username: string; password: string }) {
  const [copied, setCopied] = useState<CopyKind | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy(kind: CopyKind) {
    const text =
      kind === 'password'
        ? password
        : `Username: ${username}\nTemporary password: ${password}\nChoose a new password the first time you sign in.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyFailed(false);
      setCopied(kind);
      // The toast region is a live region, so this is also what screen readers announce.
      toast.success(
        kind === 'password'
          ? 'Password copied to the clipboard'
          : 'Sign-in details copied to the clipboard',
      );
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface-container-highest p-4">
      <h3 id="password-heading" className="text-title-small">
        Temporary password
      </h3>
      <div className="flex flex-wrap items-center gap-2 rounded-sm bg-surface p-2 pl-4">
        {/* Blurred until revealed, so a glance over the shoulder reads nothing. The text stays
            in the page for screen readers and for selecting. */}
        <output
          aria-labelledby="password-heading"
          className={cn(
            'min-w-0 flex-1 truncate font-mono text-xl tracking-wider transition-[filter] duration-150 ease-standard',
            revealed ? 'select-all' : 'blur-[6px] select-none',
          )}
        >
          {password}
        </output>
        <Button
          type="button"
          variant="ghost"
          aria-pressed={revealed}
          onClick={() => setRevealed((value) => !value)}
        >
          {revealed ? <EyeOff /> : <Eye />}
          Reveal
        </Button>
        <Button type="button" onClick={() => void copy('password')}>
          {copied === 'password' ? <Check /> : <Copy />}
          {copied === 'password' ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy('details')}>
          {copied === 'details' ? <Check className="text-success" /> : <Copy />}
          {copied === 'details' ? 'Sign-in details copied' : 'Copy sign-in details'}
        </Button>
      </div>
      <Alert variant="warning">
        <AlertTitle>Save this password now</AlertTitle>
        <AlertDescription>
          It is shown once and will not be shown again. Share it securely. They choose a new
          password the first time they sign in.
        </AlertDescription>
      </Alert>
      {copyFailed && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="mt-0 text-foreground">
            Could not copy automatically. Select the password and copy it by hand.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function OnboardResultView({
  result,
  summary,
  password,
  retrying,
  retryError,
  onRetry,
  onReset,
}: OnboardResultViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const complete = result.status === 'complete';
  const checklistStep = result.steps.find((step) => step.name === 'create_checklist');
  const showChecklist =
    checklistStep !== undefined &&
    (checklistStep.status === 'done' || (checklistStep.status === 'skipped' && complete));
  const doneSteps = result.steps.filter((step) => step.status === 'done').length;
  // Everything went well: the steps are a record, not something to act on, so they start closed.
  const stepsOpen = result.steps.some((step) => step.status !== 'done');

  useEffect(() => {
    headingRef.current?.focus();
  }, [result.status]);

  const details: { label: string; value: string; breakAll?: boolean }[] = [
    { label: 'Name', value: summary.name },
    { label: 'Username', value: summary.username },
    { label: 'Email', value: summary.email, breakAll: true },
    { label: 'Department', value: summary.departmentName },
    { label: 'Role', value: summary.role },
    ...(summary.managerName ? [{ label: 'Manager', value: summary.managerName }] : []),
    ...(summary.startDate ? [{ label: 'Start date', value: formatDay(summary.startDate) }] : []),
    ...(summary.templateName ? [{ label: 'Template', value: summary.templateName }] : []),
  ];

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex-row items-center gap-4 border-b border-outline-variant py-5">
        {/* A plain icon: no background behind it. */}
        {complete ? (
          <CircleCheck className="size-8 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <TriangleAlert className="size-8 shrink-0 text-warning" aria-hidden="true" />
        )}
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardTitle ref={headingRef} tabIndex={-1} className="outline-none">
            {complete ? 'Employee onboarded' : 'Onboarding is not finished'}
          </CardTitle>
          <CardDescription>
            {complete
              ? `${summary.name} now has an account.`
              : 'The account was created and has not been deleted. Retry to finish the remaining steps.'}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="grid items-start gap-8 py-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          {password && <PasswordBlock username={summary.username} password={password} />}

          {showChecklist && <ChecklistPanel subjectId={result.subjectId} headingLevel={3} />}
          {checklistStep && !showChecklist && (
            <p className="text-body-medium text-on-surface-variant">
              The checklist is created once every step has finished.
            </p>
          )}

          <details open={stepsOpen} className="group/steps">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm text-title-small outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
              <ChevronRight
                className="size-5 text-on-surface-variant transition-transform duration-150 ease-standard group-open/steps:rotate-90"
                aria-hidden="true"
              />
              Steps
              <span className="text-body-medium text-on-surface-variant">
                {doneSteps} of {result.steps.length} done
              </span>
            </summary>
            <ul aria-label="Onboarding steps" className="mt-3 flex flex-col">
              {result.steps.map((step, index) => {
                const badge = STATUS_BADGES[step.status];
                return (
                  <li
                    key={`${step.name}-${index}`}
                    className="group relative flex gap-3 pb-4 last:pb-0"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute top-8 bottom-0 left-2.5 w-px -translate-x-1/2 bg-outline-variant group-last:hidden"
                    />
                    <badge.icon
                      className={cn(
                        'relative mt-0.5 size-5 shrink-0',
                        STEP_ICON_COLOURS[step.status],
                      )}
                      aria-hidden="true"
                    />
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-4 text-body-medium">
                      <div className="min-w-0 pt-0.5">
                        <span className="text-label-large">{STEP_LABELS[step.name]}</span>
                        {step.label && (
                          <span className="ml-2 rounded-xs bg-surface-container-highest px-1.5 py-0.5 font-mono text-label-medium">
                            {step.label}
                          </span>
                        )}
                        {step.message && (
                          <span className="mt-0.5 block text-on-surface-variant">
                            {step.message}
                          </span>
                        )}
                      </div>
                      <Badge variant={badge.variant} className="shrink-0">
                        <badge.icon aria-hidden="true" />
                        {badge.label}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          </details>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-title-small">Details</h3>
          <dl className="divide-y divide-outline-variant rounded-md border border-outline-variant px-4 text-body-medium">
            {details.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="shrink-0 text-on-surface-variant">{row.label}</dt>
                <dd
                  className={cn(
                    'min-w-0 text-right text-label-large',
                    row.breakAll ? 'break-all' : 'break-words',
                  )}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          {summary.startDate && (
            <p className="text-body-small text-on-surface-variant">{START_DATE_NOTE_SAVED}</p>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-4 border-t border-outline-variant py-4">
        {retryError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription className="mt-0 text-foreground">{retryError}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button asChild variant="ghost">
            <Link to={`/employees?q=${encodeURIComponent(summary.username)}`}>
              <Users />
              View in Employees
            </Link>
          </Button>
          {!complete && (
            <Button type="button" onClick={onRetry} disabled={retrying}>
              <RotateCw className={cn(retrying && 'animate-spin')} />
              {retrying ? 'Retrying…' : 'Retry'}
            </Button>
          )}
          <Button type="button" variant={complete ? 'default' : 'outline'} onClick={onReset}>
            <UserPlus />
            Onboard another
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
