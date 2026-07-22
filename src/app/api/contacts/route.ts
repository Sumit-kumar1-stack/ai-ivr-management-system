import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  UserRole,
} from "@prisma/client";

import {
  requireRole,
} from "@/lib/auth";

import {
  createAuthErrorResponse,
} from "@/lib/auth-response";

import {
  ContactService,
} from "@/features/contacts/contact.service";


const CONTACT_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.AGENT,
] as const;


const CONTACT_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;


//--------------------------------------------------
// Get Contacts
//--------------------------------------------------

export async function GET(
  request: NextRequest
) {

  try {

    await requireRole(
      CONTACT_READ_ROLES
    );


    const {
      searchParams,
    } = new URL(
      request.url
    );


    const result =
      await ContactService.getContacts({
        page:
          searchParams.get(
            "page"
          ) ??
          undefined,

        limit:
          searchParams.get(
            "limit"
          ) ??
          undefined,

        search:
          searchParams.get(
            "search"
          ) ??
          undefined,

        language:
          searchParams.get(
            "language"
          ) ??
          undefined,

        status:
          searchParams.get(
            "status"
          ) ??
          undefined,
      });


    return NextResponse.json({
      success:
        true,

      message:
        "Contacts fetched successfully",

      data:
        result.contacts,

      meta:
        result.meta,
    });

  } catch (error) {

    return handleContactError(
      error,
      "Failed to fetch contacts"
    );

  }

}


//--------------------------------------------------
// Create Contact
//--------------------------------------------------

export async function POST(
  request: NextRequest
) {

  try {

    await requireRole(
      CONTACT_WRITE_ROLES
    );


    const body =
      await request.json();


    const contact =
      await ContactService.createContact(
        body
      );


    return NextResponse.json(
      {
        success:
          true,

        message:
          "Contact created successfully",

        data:
          contact,
      },
      {
        status:
          201,
      }
    );

  } catch (error) {

    return handleContactError(
      error,
      "Failed to create contact"
    );

  }

}


function handleContactError(
  error: unknown,
  fallbackMessage: string
): NextResponse {

  const authResponse =
    createAuthErrorResponse(
      error
    );


  if (
    authResponse
  ) {
    return authResponse;
  }


  console.error(
    fallbackMessage,
    error
  );


  return NextResponse.json(
    {
      success:
        false,

      message:
        fallbackMessage,
    },
    {
      status:
        500,
    }
  );

}