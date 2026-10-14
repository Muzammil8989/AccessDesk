import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/** A screen that is in the menu but not built yet: say what it is for, and offer a way back. */
export function ComingSoonPage({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description={description} />
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-outline px-6 py-16 text-center">
        <Icon className="size-12 text-on-surface-variant" aria-hidden="true" />
        <p className="text-title-medium">Coming soon</p>
        <p className="max-w-md text-body-medium text-on-surface-variant">
          This screen is not built yet.
        </p>
        <Button asChild variant="outline" className="mt-2">
          <Link to="/employees">Back to the employee list</Link>
        </Button>
      </div>
    </div>
  );
}
