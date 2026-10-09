import type { OnboardResult, OnboardStep, OnboardingStepName } from '@accessdesk/shared';
import {
  Check,
  CircleCheck,
  CircleMinus,
  CircleX,
  Copy,
  Eye,
  EyeOff,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

export interface OnboardSummary {
  name: string;
  username: string;
  email: string;
  departmentName: string;
  role: string;
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
    <div className="flex flex-col gap-4 rounded-lg border bg-muted/40 p-4">
      <h3 id="password-heading" className="text-sm font-semibold">
        Temporary password
      </h3>
      <div className="flex flex-wrap items-center gap-3">
        {/* Blurred until revealed, so a glance over the shoulder reads nothing. The text stays
            in the page for screen readers and for selecting. */}
        <output
          aria-labelledby="password-heading"
          className={cn(
            'rounded-md border bg-card px-3 py-2 font-mono text-lg tracking-wider transition-[filter] duration-150 ease-standard',
            revealed ? 'select-all' : 'blur-[6px] select-none',
          )}
        >
          {password}
        </output>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={revealed}
          onClick={() => setRevealed((value) => !value)}
        >
          {revealed ? <EyeOff /> : <Eye />}
          Reveal
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {copyState === 'copied' ? <Check /> : <Copy />}
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

  useEffect(() => {
    headingRef.current?.focus();
  }, [result.status]);

  return (
    <Card>
      <CardHeader>
        <span
          aria-hidden="true"
          className={cn(
            'mb-2 flex size-10 items-center justify-center rounded-full',
            complete ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
          )}
        >
          {complete ? <CircleCheck className="size-5" /> : <TriangleAlert className="size-5" />}
        </span>
        <CardTitle ref={headingRef} tabIndex={-1} className="text-xl outline-none">
          {complete ? 'Employee onboarded' : 'Onboarding is not finished'}
        </CardTitle>
        <CardDescription>
          {complete
            ? `${summary.name} now has an account.`
            : 'The account was created and has not been deleted. Retry to finish the remaining steps.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 rounded-lg bg-muted/40 p-4 text-sm">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="font-medium break-words">{summary.name}</dd>
          <dt className="text-muted-foreground">Username</dt>
          <dd className="font-medium break-words">{summary.username}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="font-medium break-all">{summary.email}</dd>
          <dt className="text-muted-foreground">Department</dt>
          <dd className="font-medium break-words">{summary.departmentName}</dd>
          <dt className="text-muted-foreground">Role</dt>
          <dd className="font-medium break-words">{summary.role}</dd>
        </dl>

        <ul aria-label="Onboarding steps" className="flex flex-col gap-2">
          {result.steps.map((step, index) => {
            const badge = STATUS_BADGES[step.status];
            return (
              <li
                key={`${step.name}-${index}`}
                className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium">{STEP_LABELS[step.name]}</span>
                  {step.label && <span className="ml-2 font-mono text-xs">{step.label}</span>}
                  {step.message && (
                    <span className="mt-0.5 block text-muted-foreground">{step.message}</span>
                  )}
                </div>
                <Badge variant={badge.variant} className="shrink-0">
                  <badge.icon aria-hidden="true" />
                  {badge.label}
                </Badge>
              </li>
            );
          })}
        </ul>

        {password && <PasswordBlock password={password} />}

        {retryError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription className="mt-0 text-foreground">{retryError}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-3">
          {!complete && (
            <Button type="button" onClick={onRetry} disabled={retrying}>
              {retrying ? 'Retrying…' : 'Retry'}
            </Button>
          )}
          <Button type="button" variant={complete ? 'default' : 'outline'} onClick={onReset}>
            Onboard another
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
