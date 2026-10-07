import { PgBoss } from 'pg-boss';

export function createJobQueue(databaseUrl: string): PgBoss {
  return new PgBoss(databaseUrl);
}
