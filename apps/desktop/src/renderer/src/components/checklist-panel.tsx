import type { ChecklistDetail } from '@accessdesk/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api';
import { checklistDetailQuery, setChecklistItem } from '@/lib/checklists-api';
import { authQuery } from '@/lib/session';
import { cn } from '@/lib/utils';

const progressOf = (detail: ChecklistDetail) => {
  const done = detail.items.filter((item) => item.status === 'done').length;
  return { done, total: detail.items.length };
};

const taskCount = (count: number) => `${count} ${count === 1 ? 'task' : 'tasks'}`;

interface ChecklistPanelProps {
  subjectId: string;
  /** Level 2 on a screen of its own, 3 when the panel sits inside another section. */
  headingLevel?: 2 | 3;
}

/**
 * The manual tasks for one new employee, as a list of native checkboxes. Ticking a task saves it at
 * once; the checkbox only changes when the server has accepted the change. After a failed save the
 * list is loaded again, because a request that timed out may still have been applied.
 */
export function ChecklistPanel({ subjectId, headingLevel = 2 }: ChecklistPanelProps) {
  const queryClient = useQueryClient();
  const headingId = useId();
  const [announcement, setAnnouncement] = useState('');
  const checklist = useQuery(checklistDetailQuery(subjectId));
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  const toggle = useMutation({
    mutationFn: setChecklistItem,
    retry: false,
    onSuccess: (detail, change) => {
      queryClient.setQueryData(checklistDetailQuery(subjectId).queryKey, detail);
      const title = detail.items.find((item) => item.id === change.itemId)?.title ?? 'The task';
      const { done, total } = progressOf(detail);
      setAnnouncement(
        `${title} marked ${change.done ? 'done' : 'not done'}. ${done} of ${taskCount(total)} done.`,
      );
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: checklistDetailQuery(subjectId).queryKey });
    },
  });

  const failure = checklist.error ?? toggle.error;
  const status = failure instanceof ApiRequestError ? failure.status : null;
  useEffect(() => {
    if (status === 401) void queryClient.invalidateQueries({ queryKey: authQuery.queryKey });
  }, [status, queryClient]);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <Heading
        id={headingId}
        className={cn('font-semibold', headingLevel === 2 ? 'text-lg' : 'text-sm')}
      >
        Checklist for the new employee
      </Heading>

      {checklist.isPending && (
        <div role="status" aria-label="Loading the checklist" className="flex flex-col gap-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      )}

      {checklist.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="mt-0 text-foreground">
            {checklist.error instanceof ApiRequestError && checklist.error.status === 404
              ? 'This checklist does not exist.'
              : 'Could not load the checklist.'}
          </AlertDescription>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => void checklist.refetch()}
          >
            Try again
          </Button>
        </Alert>
      )}

      {checklist.data && (
        <ChecklistTasks
          detail={checklist.data}
          saving={toggle.isPending}
          onChange={(itemId, done) => {
            if (toggle.isPending) return;
            setAnnouncement('');
            toggle.mutate({ subjectId, itemId, done });
          }}
        />
      )}

      {toggle.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="mt-0 text-foreground">
            Could not confirm the change.{' '}
            {toggle.error instanceof ApiRequestError ? `${toggle.error.message} ` : ''}
            The tasks above show what is saved. Try again if the task is not as you wanted it.
          </AlertDescription>
        </Alert>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

function ChecklistTasks({
  detail,
  saving,
  onChange,
}: {
  detail: ChecklistDetail;
  saving: boolean;
  onChange: (itemId: string, done: boolean) => void;
}) {
  const { done, total } = progressOf(detail);

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">This checklist has no tasks.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          {done} of {taskCount(total)} done
        </span>
        {detail.status === 'done' && (
          <Badge variant="success">
            <CircleCheck aria-hidden="true" />
            All tasks done
          </Badge>
        )}
      </div>
      <fieldset aria-busy={saving} className="min-w-0">
        <legend className="sr-only">Tasks for the new employee</legend>
        <ul className="flex flex-col gap-2">
          {detail.items.map((item) => {
            const inputId = `task-${item.id}`;
            const descriptionId = `${inputId}-description`;
            return (
              <li key={item.id} className="rounded-lg border text-sm">
                {/* The whole row is the label, so the pointer target is well over 40px. */}
                <label
                  htmlFor={inputId}
                  className="flex min-h-10 cursor-pointer items-start gap-3 px-4 py-3"
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={item.status === 'done'}
                    onChange={(event) => onChange(item.id, event.target.checked)}
                    aria-describedby={item.description ? descriptionId : undefined}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span className="font-medium">{item.title}</span>
                </label>
                {item.description && (
                  <p id={descriptionId} className="px-4 pb-3 pl-11 text-muted-foreground">
                    {item.description}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>
    </>
  );
}
