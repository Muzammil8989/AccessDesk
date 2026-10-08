import path from 'node:path';
import dotenv from 'dotenv';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createPrisma } from './infra/db';
import { createIdentityProviderFactory } from './infra/identity';
import { PrismaAuditRepository } from './modules/audit/prisma-audit.repository';
import { PrismaTemplateRepository } from './modules/templates/prisma-templates.repository';

dotenv.config({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });

const config = loadConfig();
const prisma = createPrisma(config.databaseUrl);
const app = await buildApp({
  config,
  templates: new PrismaTemplateRepository(prisma),
  audit: new PrismaAuditRepository(prisma),
  identityFor: createIdentityProviderFactory(config),
  checkDatabase: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
});

let shuttingDown = false;
async function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'Shutting down');
  setTimeout(() => process.exit(1), 10_000).unref();
  try {
    await app.close();
    await prisma.$disconnect();
  } finally {
    process.exit(exitCode);
  }
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  app.log.fatal({ err: reason }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (error) => {
  app.log.fatal({ err: error }, 'Uncaught exception');
  void shutdown('uncaughtException', 1);
});

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
