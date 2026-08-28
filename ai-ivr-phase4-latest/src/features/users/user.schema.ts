import { z } from "zod";

const TenantRoleSchema = z.enum([
  "ADMIN",
  "AGENT",
]);

const PlatformRoleSchema = z.enum([
  "SUPER_ADMIN",
  "ADMIN",
  "AGENT",
]);

export const CreateTenantUserSchema = z.object({
  fullName: z.string().min(3),
  email: z.email(),
  password: z.string().min(8),
  role: TenantRoleSchema.default("ADMIN"),
  phone: z.string().optional(),
}).strict();

export const CreateUserSchema =
  CreateTenantUserSchema;

export type CreateTenantUserInput =
  z.infer<typeof CreateTenantUserSchema>;

export type CreateUserInput =
  CreateTenantUserInput;

export const PlatformCreateUserSchema = z.object({
  fullName: z.string().min(3),
  email: z.email(),
  password: z.string().min(8),
  role: PlatformRoleSchema,
  phone: z.string().optional(),
}).strict();

export type PlatformCreateUserInput =
  z.infer<typeof PlatformCreateUserSchema>;

export const UpdateTenantUserSchema = z.object({
  fullName: z.string().min(3).optional(),
  phone: z.string().optional(),
  avatar: z.string().optional(),
  isActive: z.boolean().optional(),
  role: TenantRoleSchema.optional(),
}).strict();

export type UpdateTenantUserInput =
  z.infer<typeof UpdateTenantUserSchema>;

export const PlatformUpdateUserSchema = z.object({
  fullName: z.string().min(3).optional(),
  phone: z.string().optional(),
  avatar: z.string().optional(),
  isActive: z.boolean().optional(),
  role: PlatformRoleSchema.optional(),
}).strict();

export type PlatformUpdateUserInput =
  z.infer<typeof PlatformUpdateUserSchema>;
