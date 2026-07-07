import { asyncHandler } from "@/lib/async-handler";

import { success } from "@/lib/api-response";

import { ContactService } from "@/features/contacts/contact.service";

export const GET = asyncHandler(async (req) => {

    const { searchParams } =

        new URL(req.url);

    const result =

        await ContactService.getContacts({

            page:

                searchParams.get("page"),

            limit:

                searchParams.get("limit"),

            search:

                searchParams.get("search"),

            language:

                searchParams.get("language"),

            status:

                searchParams.get("status"),

        });

    return success(

        result.contacts,

        "Contacts fetched successfully",

        result.meta

    );

});