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
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-16 text-center">
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground"
        >
          <Icon className="size-6" />
        </span>
        <p className="text-base font-semibold">Coming soon</p>
        <p className="max-w-md text-sm text-muted-foreground">This screen is not built yet.</p>
        <Button asChild variant="outline" size="sm" className="mt-2">
          <Link to="/employees">Back to the employee list</Link>
        </Button>
      </div>
    </div>
  );
}
