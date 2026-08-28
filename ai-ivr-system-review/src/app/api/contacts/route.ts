import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  UserRole,
} from "@prisma/client";

import {
  createRateLimitResponse,
  ensureRateLimit,
  readClientAddress,
} from "@/lib/abuse-control";

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

    const currentUser = await requireRole(
      CONTACT_READ_ROLES
    );


    const {
      searchParams,
    } = new URL(
      request.url
    );

    await ensureRateLimit({
      scope:
        "customer-lookup",

      limit:
        60,

      windowMs:
        60 *
        1000,

      keyParts: [
        currentUser.id,

        searchParams.get(
          "search"
        ) ?? "",

        searchParams.get(
          "language"
        ) ?? "",

        searchParams.get(
          "status"
        ) ?? "",

        readClientAddress(
          request
        ),
      ],
    });


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
      },
      currentUser.role === UserRole.SUPER_ADMIN
        ? undefined
        : currentUser.id
      );


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

    const rateLimitResponse =
      createRateLimitResponse(
        error
      );

    if (
      rateLimitResponse
    ) {
      return rateLimitResponse;
    }

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

    const currentUser = await requireRole(
      CONTACT_WRITE_ROLES
    );


    const body =
      await request.json();


    const contact =
      await ContactService.createContact(
        body,
        currentUser.role === UserRole.SUPER_ADMIN
          ? undefined
          : currentUser.id
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
