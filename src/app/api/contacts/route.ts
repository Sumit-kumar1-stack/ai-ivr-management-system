import { asyncHandler } from "@/lib/async-handler";
import { success } from "@/lib/api-response";

import { ContactService } from "@/features/contacts/contact.service";

export const GET = asyncHandler(async (req) => {
  const { searchParams } = new URL(req.url);

  const result = await ContactService.getContacts({
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    language: searchParams.get("language") ?? undefined,
    status: searchParams.get("status") ?? undefined,
  });

  return success(
    result.contacts,
    "Contacts fetched successfully",
    result.meta
  );
});

export const POST = asyncHandler(async (req) => {
  const body = await req.json();

  const contact = await ContactService.createContact(body);

  return success(
    contact,
    "Contact created successfully"
  );
});
