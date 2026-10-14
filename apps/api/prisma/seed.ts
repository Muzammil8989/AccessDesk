import path from 'node:path';
import dotenv from 'dotenv';
import { createPrisma } from '../src/infra/db';
import type { ItemKind } from '../src/generated/prisma/client';

dotenv.config({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });

interface SeedItem {
  title: string;
  kind: ItemKind;
  targetRef?: string;
  description?: string;
}

interface SeedTemplate {
  name: string;
  description: string;
  departmentRef?: string;
  defaultRole?: 'member' | 'manager' | 'admin';
  isDefault?: boolean;
  items: SeedItem[];
}

const templates: SeedTemplate[] = [
  {
    name: 'General onboarding',
    description:
      'The checklist every new employee starts with when no template adds its own tasks.',
    isDefault: true,
    // Manual tasks only. A group or role item here would bypass the role rule (ADR 0011).
    items: [
      { title: 'Hand over laptop', kind: 'MANUAL_TASK' },
      { title: 'Create email account', kind: 'MANUAL_TASK' },
      { title: 'Hand over access card', kind: 'MANUAL_TASK' },
      { title: 'Introduce to the team and manager', kind: 'MANUAL_TASK' },
    ],
  },
  {
    name: 'Developer',
    description: 'Engineering hires: source control, CI and internal tooling.',
    departmentRef: '/Engineering',
    defaultRole: 'member',
    items: [
      { title: 'Assign developer role', kind: 'ROLE', targetRef: 'developer' },
      { title: 'Order laptop', kind: 'MANUAL_TASK', description: 'Standard developer spec.' },
      { title: 'Schedule security awareness training', kind: 'MANUAL_TASK' },
    ],
  },
  {
    name: 'Sales',
    description: 'Sales hires: CRM and customer-facing tools.',
    departmentRef: '/Sales',
    defaultRole: 'member',
    items: [
      { title: 'Assign sales role', kind: 'ROLE', targetRef: 'sales' },
      { title: 'Create CRM account', kind: 'MANUAL_TASK' },
    ],
  },
  {
    name: 'HR',
    description: 'HR hires: people systems and confidential records.',
    departmentRef: '/HR',
    defaultRole: 'member',
    items: [
      { title: 'Assign hr-admin role', kind: 'ROLE', targetRef: 'hr-admin' },
      { title: 'Sign confidentiality agreement', kind: 'MANUAL_TASK' },
    ],
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const prisma = createPrisma(url);

  try {
    let created = 0;
    for (const t of templates) {
      // Create only if missing: a template that exists, edited or not, is never touched, so
      // running the seed again cannot undo changes made in the database.
      const exists = await prisma.onboardingTemplate.findUnique({
        where: { name: t.name },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.onboardingTemplate.create({
        data: {
          name: t.name,
          description: t.description,
          departmentRef: t.departmentRef ?? null,
          defaultRole: t.defaultRole ?? null,
          isDefault: t.isDefault ?? false,
          items: {
            create: t.items.map((item, position) => ({
              title: item.title,
              kind: item.kind,
              targetRef: item.targetRef ?? null,
              description: item.description ?? null,
              position,
            })),
          },
        },
      });
      created += 1;
    }
    console.log(`Seeded ${created} new templates (${templates.length - created} already existed)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
