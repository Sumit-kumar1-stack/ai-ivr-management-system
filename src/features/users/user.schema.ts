import { z } from "zod";

export const CreateUserSchema = z.object({
  fullName: z.string().min(3),
  email: z.email(),
  password: z.string().min(8),
  role: z.enum([
    "SUPER_ADMIN",
    "ADMIN",
    "AGENT",
  ]),
  phone: z.string().optional(),
});

export type CreateUserInput =
  z.infer<typeof CreateUserSchema>;