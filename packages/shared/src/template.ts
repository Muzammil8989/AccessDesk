import { z } from 'zod';
import { ONBOARDABLE_ROLES } from './onboarding';
import { roleViolation, type RolePolicy } from './role-policy';

export const ITEM_KINDS = ['GROUP_MEMBERSHIP', 'ROLE', 'MANUAL_TASK'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const templateItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  kind: z.enum(ITEM_KINDS),
  targetRef: z.string().nullable(),
  position: z.number().int(),
});
export type TemplateItem = z.infer<typeof templateItemSchema>;

export const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  departmentRef: z.string().nullable(),
  defaultRole: z.enum(ONBOARDABLE_ROLES).nullable(),
  items: z.array(templateItemSchema),
});
export type Template = z.infer<typeof templateSchema>;

export const templateListSchema = z.object({ items: z.array(templateSchema) });
export type TemplateList = z.infer<typeof templateListSchema>;

/**
 * Why a template may not be applied by this caller, or null. Shared so that applying a template and
 * saving one cannot disagree (ADR 0011). Only roles can be refused; groups are checked against the
 * identity provider.
 */
export function templateViolation(
  template: Pick<Template, 'defaultRole' | 'items'>,
  callerRoles: readonly string[],
  policy: RolePolicy,
): string | null {
  const roles = [
    ...(template.defaultRole ? [template.defaultRole] : []),
    ...template.items.flatMap((item) =>
      item.kind === 'ROLE' && item.targetRef ? [item.targetRef] : [],
    ),
  ];
  for (const role of roles) {
    const reason = roleViolation(role, callerRoles, policy);
    if (reason) return reason;
  }
  return null;
}
