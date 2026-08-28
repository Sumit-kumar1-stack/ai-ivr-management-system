import { validateRow } from "./csv.validator";
import type { CreateContactInput } from "./contact.schema";

export function prepareContacts(rows: Record<string, string>[]) {
  const valid: CreateContactInput[] = [];
  const invalid: { row: Record<string, string>; errors: unknown }[] = [];

  for (const row of rows) {
    const result = validateRow(row);

    if (result.success) {
      valid.push({
        fullName: result.data.Name,
        phone: result.data.Phone,
        email: result.data.Email || undefined,
        company: row.Company || undefined,
        language: result.data.Language || "English",
        notes: row.Notes || undefined,
      });
    } else {
      invalid.push({
        row,
        errors: result.error.flatten(),
      });
    }
  }

  return {
    valid,
    invalid,
  };
}
