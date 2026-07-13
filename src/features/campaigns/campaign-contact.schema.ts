import { z } from "zod";

export const AssignContactsSchema = z.object({
  contactIds: z.array(z.string().min(1)).min(1),
});