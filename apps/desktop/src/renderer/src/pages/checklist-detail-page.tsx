import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ChecklistPanel } from '@/components/checklist-panel';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { checklistDetailQuery } from '@/lib/checklists-api';
import { formatDate } from '@/lib/format';

export function ChecklistDetailPage() {
  const { subjectId = '' } = useParams<{ subjectId: string }>();
  const checklist = useQuery(checklistDetailQuery(subjectId));
  const detail = checklist.data;

  const title = detail
    ? `Checklist for ${detail.person?.displayName ?? 'an unknown person'}`
    : 'Checklist';
  const facts = detail
    ? [
        detail.person ? `Username ${detail.person.username}` : 'Not found in the identity provider',
        detail.templateName ? `Template ${detail.templateName}` : null,
        `Started ${formatDate(detail.createdAt)}`,
      ].filter(Boolean)
    : [];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        focusOnMount
        title={title}
        description={facts.join(' · ') || undefined}
        actions={
          <Button asChild variant="outline">
            <Link to="/onboard/checklists">
              <ArrowLeft /> All checklists
            </Link>
          </Button>
        }
      />
      <ChecklistPanel subjectId={subjectId} />
    </div>
  );
}
