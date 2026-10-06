import { z } from 'zod';

// Employee data lives in Keycloak. This is only the view the app shows;
// AccessDesk never stores name or email in its own database.
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

export const MAX_PAGE_SIZE = 100;

export const listEmployeesQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  first: z.coerce.number().int().min(0).default(0),
  max: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

export const employeeListSchema = z.object({
  items: z.array(employeeSchema),
  total: z.number().int().min(0),
  first: z.number().int().min(0),
  max: z.number().int().min(1),
});
export type EmployeeList = z.infer<typeof employeeListSchema>;

// Keycloak user IDs are UUIDs. Validating early stops odd values from reaching a URL path.
export const employeeIdParamsSchema = z.object({ id: z.uuid() });
