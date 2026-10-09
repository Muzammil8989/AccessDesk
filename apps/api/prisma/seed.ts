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
  departmentRef: string;
  defaultRole: 'member' | 'manager' | 'admin';
  items: SeedItem[];
}

const templates: SeedTemplate[] = [
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
    for (const t of templates) {
      await prisma.$transaction(async (tx) => {
        const template = await tx.onboardingTemplate.upsert({
          where: { name: t.name },
          update: {
            description: t.description,
            departmentRef: t.departmentRef,
            defaultRole: t.defaultRole,
          },
          create: {
            name: t.name,
            description: t.description,
            departmentRef: t.departmentRef,
            defaultRole: t.defaultRole,
          },
        });
        await tx.templateItem.deleteMany({ where: { templateId: template.id } });
        await tx.templateItem.createMany({
          data: t.items.map((item, position) => ({
            templateId: template.id,
            title: item.title,
            kind: item.kind,
            targetRef: item.targetRef ?? null,
            description: item.description ?? null,
            position,
          })),
        });
      });
    }
    console.log(`Seeded ${templates.length} templates`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
