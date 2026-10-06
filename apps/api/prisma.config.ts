import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

// One .env at the repo root is shared by every app.
dotenv.config({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // `prisma generate` needs no database, so a missing URL must not break installs or CI.
  // Commands that connect (migrate, db seed) report the missing datasource clearly.
  datasource: databaseUrl ? { url: databaseUrl } : undefined,
});
