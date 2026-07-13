import { asyncHandler } from "@/lib/async-handler";
import { success } from "@/lib/api-response";

import { ContactService } from "@/features/contacts/contact.service";

export const GET = asyncHandler(async (req) => {
  const { searchParams } = new URL(req.url);

  const result = await ContactService.getContacts({
    page: searchParams.get("page"),
    limit: searchParams.get("limit"),
    search: searchParams.get("search"),
    language: searchParams.get("language"),
    status: searchParams.get("status"),
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