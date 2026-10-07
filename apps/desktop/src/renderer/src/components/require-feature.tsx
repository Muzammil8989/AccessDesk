import { canAccess, type Feature } from '@accessdesk/shared';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { authQuery } from '@/lib/session';

export function RequireFeature({ feature, children }: { feature: Feature; children: ReactNode }) {
  const auth = useQuery(authQuery);
  if (auth.isPending) return null;
  if (!canAccess(auth.data?.roles ?? [], feature, auth.data?.adminRoles ?? []))
    return <Navigate to="/no-access" replace />;
  return children;
}
