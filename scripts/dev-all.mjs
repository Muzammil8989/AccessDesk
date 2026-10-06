// Start everything in one command: pnpm dev:all
// Brings up the database, applies pending migrations, then runs the API and the desktop app.
import { checkNode, ensureEnvFile, migrateDatabase, run, startDatabase, step } from './lib.mjs';

checkNode();

step('Environment file');
ensureEnvFile();

step('Starting PostgreSQL (docker compose)');
startDatabase();

step('Applying pending database migrations');
migrateDatabase();

step('Starting the API and the desktop app (Ctrl+C to stop)');
run('pnpm', ['dev']);
