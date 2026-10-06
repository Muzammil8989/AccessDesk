import type { Feature } from '@accessdesk/shared';
import type { ReactNode } from 'react';
import { createHashRouter, Navigate, type RouteObject } from 'react-router';
import { AppLayout } from '@/components/app-layout';
import { RequireFeature } from '@/components/require-feature';
import { ComingSoonPage } from '@/pages/coming-soon-page';
import { EmployeesPage } from '@/pages/employees-page';
import { LoginPage } from '@/pages/login-page';
import { NoAccessPage } from '@/pages/no-access-page';
import { SettingsPage } from '@/pages/settings-page';
import { SetupPage } from '@/pages/setup-page';

const guarded = (feature: Feature, page: ReactNode) => (
  <RequireFeature feature={feature}>{page}</RequireFeature>
);

// Hash routing works the same under the dev server and the app:// scheme, with no server fallback needed.
// The route table is exported separately so tests can mount the real routes in a memory router.
export const routes: RouteObject[] = [
  { path: '/setup', element: <SetupPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/no-access', element: <NoAccessPage /> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/employees" replace /> },
      { path: 'employees', element: guarded('employees', <EmployeesPage />) },
      { path: 'onboard', element: guarded('onboard', <ComingSoonPage title="Onboard" />) },
      { path: 'offboard', element: guarded('offboard', <ComingSoonPage title="Offboard" />) },
      {
        path: 'access-review',
        element: guarded('access-review', <ComingSoonPage title="Access Review" />),
      },
      { path: 'audit-log', element: guarded('audit-log', <ComingSoonPage title="Audit Log" />) },
      { path: 'settings', element: guarded('settings', <SettingsPage />) },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

export const router = createHashRouter(routes);
