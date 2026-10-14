import { z } from 'zod';

export const employeeSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  enabled: z.boolean(),
  emailVerified: z.boolean(),
  createdAt: z.string().nullable(),
});
export type Employee = z.infer<typeof employeeSchema>;

// What the detail screen shows besides the profile. Both lists are what the person holds directly:
// a role that arrives through a group or a composite role is not in `roles`.
export const employeeDetailSchema = employeeSchema.extend({
  groups: z.array(z.object({ id: z.string(), name: z.string(), path: z.string() })),
  roles: z.array(z.object({ name: z.string(), description: z.string().nullable() })),
});
export type EmployeeDetail = z.infer<typeof employeeDetailSchema>;

export const MAX_PAGE_SIZE = 100;

// A query string only carries text, and z.coerce.boolean() would turn 'false' into true.
const enabledFilterSchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export const listEmployeesQuerySchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    enabled: enabledFilterSchema,
    groupId: z.string().trim().min(1).max(100).optional(),
    role: z.string().trim().min(1).max(100).optional(),
    first: z.coerce.number().int().min(0).default(0),
    max: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
  })
  .refine((query) => query.groupId === undefined || query.role === undefined, {
    message: 'Filter by a group or by a role, not both',
    path: ['groupId'],
  });
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

export const employeeListSchema = z.object({
  items: z.array(employeeSchema),
  total: z.number().int().min(0),
  // True when a group or role filter hit the member cap, so total is a lower bound.
  capped: z.boolean().default(false),
  first: z.number().int().min(0),
  max: z.number().int().min(1),
});
export type EmployeeList = z.infer<typeof employeeListSchema>;

export const employeeFilterOptionsSchema = z.object({
  groups: z.array(z.object({ id: z.string(), name: z.string() })),
  roles: z.array(z.object({ name: z.string() })),
});
export type EmployeeFilterOptions = z.infer<typeof employeeFilterOptionsSchema>;

export const employeeIdParamsSchema = z.object({ id: z.uuid() });
