import { NextRequest } from "next/server";
import Papa from "papaparse";
import { UserRole } from "@prisma/client";

import { success } from "@/lib/api-response";
import { asyncHandler } from "@/lib/async-handler";
import { requireRole } from "@/lib/auth";
import { ContactService } from "@/features/contacts/contact.service";

const CONTACT_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

export const POST = asyncHandler(async (req: NextRequest) => {
    const currentUser = await requireRole(CONTACT_WRITE_ROLES);

    const formData = await req.formData();

    const file = formData.get("file") as File;

    if (!file) {

        throw new Error("CSV file is required");

    }

    const text = await file.text();

    const parsed = Papa.parse(text, {

        header: true,

        skipEmptyLines: true,

    });

    const rows = parsed.data.filter(
        (row): row is Record<string, unknown> =>
            typeof row === "object" && row !== null && !Array.isArray(row)
    );

    const report = await ContactService.importContacts(
      rows,
      currentUser.role === UserRole.SUPER_ADMIN
        ? undefined
        : currentUser.id
    );

    return success(
        report,
        "Contacts imported successfully"
    );

});
