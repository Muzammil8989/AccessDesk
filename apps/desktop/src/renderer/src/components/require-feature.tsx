import { canAccess, type Feature } from '@accessdesk/shared';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { authQuery } from '@/lib/session';

/**
 * Only renders its children when the signed-in user's role allows the feature. Typing the URL of a
 * hidden screen leads here too. This is a UI convenience: the API enforces the real rule.
 */
export function RequireFeature({ feature, children }: { feature: Feature; children: ReactNode }) {
  const auth = useQuery(authQuery);
  if (auth.isPending) return null;
  if (!canAccess(auth.data?.roles ?? [], feature)) return <Navigate to="/no-access" replace />;
  return children;
}
