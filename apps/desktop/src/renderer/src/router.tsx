import type { Feature } from '@accessdesk/shared';
import { ScrollText, ShieldCheck, UserMinus } from 'lucide-react';
import { lazy, type ReactNode } from 'react';
import { createHashRouter, Navigate, type RouteObject } from 'react-router';
import { AppLayout } from '@/components/app-layout';
import { PageTransition } from '@/components/page-transition';
import { RequireFeature } from '@/components/require-feature';
import { ComingSoonPage } from '@/pages/coming-soon-page';
import { LoginPage } from '@/pages/login-page';
import { NoAccessPage } from '@/pages/no-access-page';
import { SetupPage } from '@/pages/setup-page';

// The screens inside the signed-in shell load on demand, so the sign-in path does not pay for the
// onboarding form (react-hook-form + zod). AppLayout owns the Suspense boundary around them.
const ChecklistDetailPage = lazy(() =>
  import('@/pages/checklist-detail-page').then((m) => ({ default: m.ChecklistDetailPage })),
);
const ChecklistsPage = lazy(() =>
  import('@/pages/checklists-page').then((m) => ({ default: m.ChecklistsPage })),
);
const EmployeeDetailPage = lazy(() =>
  import('@/pages/employee-detail-page').then((m) => ({ default: m.EmployeeDetailPage })),
);
const EmployeesPage = lazy(() =>
  import('@/pages/employees-page').then((m) => ({ default: m.EmployeesPage })),
);
const OnboardPage = lazy(() =>
  import('@/pages/onboard-page').then((m) => ({ default: m.OnboardPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/settings-page').then((m) => ({ default: m.SettingsPage })),
);

const guarded = (feature: Feature, page: ReactNode) => (
  <RequireFeature feature={feature}>
    <PageTransition>{page}</PageTransition>
  </RequireFeature>
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
      { path: 'employees/:id', element: guarded('employees', <EmployeeDetailPage />) },
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
