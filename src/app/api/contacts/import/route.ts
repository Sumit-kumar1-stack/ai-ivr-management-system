import { NextRequest } from "next/server";
import Papa from "papaparse";

import { success } from "@/lib/api-response";
import { asyncHandler } from "@/lib/async-handler";
import { ContactService } from "@/features/contacts/contact.service";

export const POST = asyncHandler(async (req: NextRequest) => {

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

    const report = await ContactService.importContacts(
        parsed.data
    );

    return success(
        report,
        "Contacts imported successfully"
    );

});