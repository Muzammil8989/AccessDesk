import type { OnboardResult, OnboardStep, OnboardingStepName } from '@accessdesk/shared';
import {
  Check,
  CircleCheck,
  CircleMinus,
  CircleX,
  Copy,
  Eye,
  EyeOff,
  RotateCw,
  TriangleAlert,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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

const STEP_DOTS: Record<OnboardStep['status'], string> = {
  done: 'bg-success/15 text-success',
  failed: 'bg-destructive/15 text-destructive',
  skipped: 'bg-muted text-muted-foreground',
};

/** How long "Copied" stays before the button goes back to "Copy". */
const COPIED_RESET_MS = 3000;

function PasswordBlock({ password }: { password: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (copyState !== 'copied') return;
    const timer = setTimeout(() => setCopyState('idle'), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copyState]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopyState('copied');
      // The toast region is a live region, so this is also what screen readers announce.
      toast.success('Password copied to the clipboard');
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 id="password-heading" className="text-sm font-semibold">
        Temporary password
      </h3>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 pl-4">
        {/* Blurred until revealed, so a glance over the shoulder reads nothing. The text stays
            in the page for screen readers and for selecting. */}
        <output
          aria-labelledby="password-heading"
          className={cn(
            'min-w-0 flex-1 truncate font-mono text-lg tracking-wider transition-[filter] duration-150 ease-standard',
            revealed ? 'select-all' : 'blur-[6px] select-none',
          )}
        >
          {password}
        </output>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={revealed}
          onClick={() => setRevealed((value) => !value)}
        >
          {revealed ? <EyeOff /> : <Eye />}
          Reveal
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {copyState === 'copied' ? <Check className="text-success" /> : <Copy />}
          {copyState === 'copied' ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <Alert variant="warning">
        <AlertTitle>Save this password now</AlertTitle>
        <AlertDescription>
          This password is shown only once and will not be shown again. Copy it now and share it
          securely. The employee must choose a new password the first time they sign in.
        </AlertDescription>
      </Alert>
      {copyState === 'failed' && (
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
      <CardHeader className="flex-row items-center gap-4 border-b py-5">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full',
            complete ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
          )}
        >
          {complete ? <CircleCheck className="size-5" /> : <TriangleAlert className="size-5" />}
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardTitle ref={headingRef} tabIndex={-1} className="text-xl outline-none">
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
          {password && <PasswordBlock password={password} />}

          {showChecklist && <ChecklistPanel subjectId={result.subjectId} headingLevel={3} />}
          {checklistStep && !showChecklist && (
            <p className="text-sm text-muted-foreground">
              The checklist is created once every step has finished.
            </p>
          )}

          <section aria-labelledby="steps-heading" className="flex flex-col gap-3">
            <h3 id="steps-heading" className="text-sm font-semibold">
              Steps
            </h3>
            <ul aria-label="Onboarding steps" className="flex flex-col">
              {result.steps.map((step, index) => {
                const badge = STATUS_BADGES[step.status];
                return (
                  <li
                    key={`${step.name}-${index}`}
                    className="group relative flex gap-3 pb-4 last:pb-0"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute top-7 bottom-0 left-3 w-px -translate-x-1/2 bg-border group-last:hidden"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        'relative flex size-6 shrink-0 items-center justify-center rounded-full',
                        STEP_DOTS[step.status],
                      )}
                    >
                      <badge.icon className="size-3.5" />
                    </span>
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-4 text-sm">
                      <div className="min-w-0 pt-0.5">
                        <span className="font-medium">{STEP_LABELS[step.name]}</span>
                        {step.label && (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                            {step.label}
                          </span>
                        )}
                        {step.message && (
                          <span className="mt-0.5 block text-muted-foreground">{step.message}</span>
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
          </section>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Details</h3>
          <dl className="divide-y rounded-lg border px-4 text-sm">
            {details.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
                <dd
                  className={cn(
                    'min-w-0 text-right font-medium',
                    row.breakAll ? 'break-all' : 'break-words',
                  )}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          {summary.startDate && (
            <p className="text-xs text-muted-foreground">{START_DATE_NOTE_SAVED}</p>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-4 border-t py-4">
        {retryError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription className="mt-0 text-foreground">{retryError}</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end gap-3">
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
