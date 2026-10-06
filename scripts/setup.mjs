// One-time project setup: pnpm setup
import {
  checkNode,
  ensureEnvFile,
  migrateDatabase,
  seedDatabase,
  startDatabase,
  step,
} from './lib.mjs';

checkNode();

step('Environment file');
ensureEnvFile();

step('Starting PostgreSQL (docker compose)');
startDatabase();

step('Applying database migrations');
migrateDatabase();

step('Seeding onboarding templates');
seedDatabase();

console.log('\n✓ Setup complete. Start everything with: pnpm dev');
