import { z } from "zod";

export const CreateContactSchema = z.object({

    fullName:

    z.string().min(2),

    phone:

    z.string().min(10),

    email:

    z.string().email().optional(),

    company:

    z.string().optional(),

    language:

    z.string().default("English"),

    notes:

    z.string().optional()

});

export type CreateContactInput=
z.infer<typeof CreateContactSchema>;

export const UpdateContactSchema = CreateContactSchema.partial();

export const ContactQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).optional(),
  language: z.string().trim().max(50).optional(),
  status: z.enum(["PENDING", "CALLED", "ANSWERED", "FAILED", "BLOCKED"]).optional(),
});

export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;
export type ContactQueryInput = Record<string, string | undefined>;
