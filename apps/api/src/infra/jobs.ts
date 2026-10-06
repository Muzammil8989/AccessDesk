import { PgBoss } from 'pg-boss';

// STUB: scheduled actions (e.g. disable a user on their last day) will run through pg-boss.
// Nothing calls this yet, so no queues or pg-boss tables are created.
//
// Open design question for the offboarding milestone: a job that fires later has no logged-in
// admin token to forward. Options are a stored refresh/offline token per admin, or running the
// action when the admin next opens the app. Decide before building scheduled actions.
export function createJobQueue(databaseUrl: string): PgBoss {
  return new PgBoss(databaseUrl);
}
