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