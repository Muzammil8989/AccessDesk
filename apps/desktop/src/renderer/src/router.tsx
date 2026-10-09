import type { Feature } from '@accessdesk/shared';
import { ScrollText, ShieldCheck, UserMinus } from 'lucide-react';
import type { ReactNode } from 'react';
import { createHashRouter, Navigate, type RouteObject } from 'react-router';
import { AppLayout } from '@/components/app-layout';
import { RequireFeature } from '@/components/require-feature';
import { ChecklistDetailPage } from '@/pages/checklist-detail-page';
import { ChecklistsPage } from '@/pages/checklists-page';
import { ComingSoonPage } from '@/pages/coming-soon-page';
import { EmployeesPage } from '@/pages/employees-page';
import { LoginPage } from '@/pages/login-page';
import { NoAccessPage } from '@/pages/no-access-page';
import { OnboardPage } from '@/pages/onboard-page';
import { SettingsPage } from '@/pages/settings-page';
import { SetupPage } from '@/pages/setup-page';

const guarded = (feature: Feature, page: ReactNode) => (
  <RequireFeature feature={feature}>{page}</RequireFeature>
);

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
      { path: 'onboard', element: guarded('onboard', <OnboardPage />) },
      { path: 'onboard/checklists', element: guarded('onboard', <ChecklistsPage />) },
      {
        path: 'onboard/checklists/:subjectId',
        element: guarded('onboard', <ChecklistDetailPage />),
      },
      {
        path: 'offboard',
        element: guarded(
          'offboard',
          <ComingSoonPage
            title="Offboard"
            description="Offboard an employee when they leave."
            icon={UserMinus}
          />,
        ),
      },
      {
        path: 'access-review',
        element: guarded(
          'access-review',
          <ComingSoonPage
            title="Access Review"
            description="Review who has access to what."
            icon={ShieldCheck}
          />,
        ),
      },
      {
        path: 'audit-log',
        element: guarded(
          'audit-log',
          <ComingSoonPage
            title="Audit Log"
            description="AccessDesk's own record of who changed what, and when."
            icon={ScrollText}
          />,
        ),
      },
      { path: 'settings', element: guarded('settings', <SettingsPage />) },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

export const router = createHashRouter(routes);
