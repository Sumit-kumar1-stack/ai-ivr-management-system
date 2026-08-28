import { z } from "zod";

const CsvRowSchema = z.object({
  Name: z.string().min(2, "Name is required"),
  Phone: z.string().min(10, "Phone number is required"),
  Email: z
    .string()
    .email("Invalid email")
    .optional()
    .or(z.literal("")),
  Language: z.string().optional(),
});

export function validateRow(row: unknown) {
  return CsvRowSchema.safeParse(row);
}