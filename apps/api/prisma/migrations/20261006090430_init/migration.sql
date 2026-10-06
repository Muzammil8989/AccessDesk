-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('GROUP_MEMBERSHIP', 'REALM_ROLE', 'MANUAL_TASK');

-- CreateEnum
CREATE TYPE "ChecklistType" AS ENUM ('ONBOARDING', 'OFFBOARDING');

-- CreateEnum
CREATE TYPE "ChecklistStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('PENDING', 'DONE', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScheduledActionType" AS ENUM ('DISABLE_USER', 'LOGOUT_ALL_SESSIONS', 'REMOVE_ALL_ACCESS');

-- CreateEnum
CREATE TYPE "ScheduledActionStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "onboarding_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_items" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "ItemKind" NOT NULL,
    "target_ref" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_checklists" (
    "id" UUID NOT NULL,
    "keycloak_user_id" TEXT NOT NULL,
    "template_id" UUID,
    "type" "ChecklistType" NOT NULL,
    "status" "ChecklistStatus" NOT NULL DEFAULT 'OPEN',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "employee_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" UUID NOT NULL,
    "checklist_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "ItemKind" NOT NULL,
    "target_ref" TEXT,
    "status" "ChecklistItemStatus" NOT NULL DEFAULT 'PENDING',
    "position" INTEGER NOT NULL,
    "completed_at" TIMESTAMP(3),
    "completed_by" TEXT,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_actions" (
    "id" UUID NOT NULL,
    "keycloak_user_id" TEXT NOT NULL,
    "action" "ScheduledActionType" NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledActionStatus" NOT NULL DEFAULT 'PENDING',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executed_at" TIMESTAMP(3),
    "last_error" TEXT,

    CONSTRAINT "scheduled_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offboarding_snapshots" (
    "id" UUID NOT NULL,
    "keycloak_user_id" TEXT NOT NULL,
    "groups" JSONB NOT NULL DEFAULT '[]',
    "realm_roles" JSONB NOT NULL DEFAULT '[]',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offboarding_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_audit_log" (
    "id" UUID NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_keycloak_user_id" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_templates_name_key" ON "onboarding_templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "template_items_template_id_position_key" ON "template_items"("template_id", "position");

-- CreateIndex
CREATE INDEX "employee_checklists_keycloak_user_id_idx" ON "employee_checklists"("keycloak_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_items_checklist_id_position_key" ON "checklist_items"("checklist_id", "position");

-- CreateIndex
CREATE INDEX "scheduled_actions_status_run_at_idx" ON "scheduled_actions"("status", "run_at");

-- CreateIndex
CREATE INDEX "scheduled_actions_keycloak_user_id_idx" ON "scheduled_actions"("keycloak_user_id");

-- CreateIndex
CREATE INDEX "offboarding_snapshots_keycloak_user_id_idx" ON "offboarding_snapshots"("keycloak_user_id");

-- CreateIndex
CREATE INDEX "app_audit_log_target_keycloak_user_id_idx" ON "app_audit_log"("target_keycloak_user_id");

-- CreateIndex
CREATE INDEX "app_audit_log_created_at_idx" ON "app_audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "template_items" ADD CONSTRAINT "template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "onboarding_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_checklists" ADD CONSTRAINT "employee_checklists_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "onboarding_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "employee_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
