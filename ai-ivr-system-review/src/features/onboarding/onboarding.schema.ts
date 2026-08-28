import { z } from "zod";

export const CreateTenantInvitationSchema = z.object({
  tenantName: z.string().min(3),
  tenantSlug: z.string().min(3).optional(),
  adminFullName: z.string().min(3),
  adminEmail: z.email(),
  adminRole: z.enum([
    "ADMIN",
    "AGENT",
  ]).default("ADMIN"),
  adminPhone: z.string().optional(),
});

export type CreateTenantInvitationInput = z.infer<
  typeof CreateTenantInvitationSchema
>;

export const AcceptTenantInvitationSchema = z.object({
  fullName: z.string().min(3),
  password: z.string().min(8),
  phone: z.string().optional(),
});

export type AcceptTenantInvitationInput = z.infer<
  typeof AcceptTenantInvitationSchema
>;
