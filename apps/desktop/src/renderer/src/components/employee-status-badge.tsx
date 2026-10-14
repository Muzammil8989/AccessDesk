import { CircleCheck, CircleSlash } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/** Active or Disabled, always as a word with an icon, so colour is never the only signal. */
export function EmployeeStatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <Badge variant={enabled ? 'success' : 'secondary'}>
      {enabled ? <CircleCheck aria-hidden="true" /> : <CircleSlash aria-hidden="true" />}
      {enabled ? 'Active' : 'Disabled'}
    </Badge>
  );
}
