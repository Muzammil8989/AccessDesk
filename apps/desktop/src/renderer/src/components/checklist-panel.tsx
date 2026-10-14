import type { ChecklistDetail } from '@accessdesk/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { useId, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useReauthOn401 } from '@/hooks/use-reauth-on-401';
import { ApiRequestError } from '@/lib/api';
import { taskCount } from '@/lib/format';
import { checklistDetailQuery, setChecklistClosed, setChecklistItem } from '@/lib/checklists-api';

const progressOf = (detail: ChecklistDetail) => {
  const done = detail.items.filter((item) => item.status === 'done').length;
  return { done, total: detail.items.length };
};

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
      void queryClient.invalidateQueries({ queryKey: ['checklists'] });
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

  const close = useMutation({
    mutationFn: setChecklistClosed,
    retry: false,
    onSuccess: (detail, change) => {
      queryClient.setQueryData(checklistDetailQuery(subjectId).queryKey, detail);
      void queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setAnnouncement(change.closed ? 'Checklist marked as done.' : 'Checklist reopened.');
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: checklistDetailQuery(subjectId).queryKey });
    },
  });

  useReauthOn401(checklist.error ?? toggle.error ?? close.error);
  const saving = toggle.isPending || close.isPending;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <Heading
        id={headingId}
        className={headingLevel === 2 ? 'text-title-large' : 'text-title-small'}
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

      {checklist.data &&
        (checklist.data.items.length === 0 ? (
          <EmptyChecklist
            detail={checklist.data}
            saving={saving}
            onClose={(closed) => {
              if (close.isPending) return;
              setAnnouncement('');
              close.mutate({ subjectId, closed });
            }}
          />
        ) : (
          <TaskList
            detail={checklist.data}
            saving={saving}
            onChange={(itemId, done) => {
              if (toggle.isPending) return;
              setAnnouncement('');
              toggle.mutate({ subjectId, itemId, done });
            }}
          />
        ))}

      {(toggle.isError || close.isError) && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="mt-0 text-foreground">
            Could not confirm the change.{' '}
            {(toggle.error ?? close.error) instanceof ApiRequestError
              ? `${(toggle.error ?? close.error)?.message} `
              : ''}
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

/** A checklist with no tasks has nothing to tick, so the admin closes it by hand. */
function EmptyChecklist({
  detail,
  saving,
  onClose,
}: {
  detail: ChecklistDetail;
  saving: boolean;
  onClose: (closed: boolean) => void;
}) {
  const closed = detail.status === 'done';
  return (
    <div className="flex flex-col gap-3" aria-busy={saving}>
      <div className="flex flex-wrap items-center gap-2 text-body-medium text-on-surface-variant">
        <span>This checklist has no tasks.</span>
        {closed && (
          <Badge variant="success">
            <CircleCheck aria-hidden="true" />
            Marked as done
          </Badge>
        )}
      </div>
      <p className="text-body-medium text-on-surface-variant">
        {closed
          ? 'It is in the Done list. Reopen it to put it back in the Open list.'
          : 'It stays in the Open list until you mark it as done.'}
      </p>
      <div>
        <Button type="button" variant="outline" onClick={() => onClose(!closed)}>
          {closed ? 'Reopen checklist' : 'Mark as done'}
        </Button>
      </div>
    </div>
  );
}

function TaskList({
  detail,
  saving,
  onChange,
}: {
  detail: ChecklistDetail;
  saving: boolean;
  onChange: (itemId: string, done: boolean) => void;
}) {
  const { done, total } = progressOf(detail);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-body-medium text-on-surface-variant">
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
              <li
                key={item.id}
                className="rounded-md border border-outline-variant text-body-medium"
              >
                {/* The whole row is the label, so the pointer target is well over 40px. */}
                <label
                  htmlFor={inputId}
                  className="state-layer flex min-h-10 cursor-pointer items-start gap-3 rounded-md px-4 py-3"
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={item.status === 'done'}
                    onChange={(event) => onChange(item.id, event.target.checked)}
                    aria-describedby={item.description ? descriptionId : undefined}
                    className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-primary focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <span className="text-label-large">{item.title}</span>
                </label>
                {item.description && (
                  <p id={descriptionId} className="px-4 pb-3 pl-11 text-on-surface-variant">
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
