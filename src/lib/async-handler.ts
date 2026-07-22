import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  Prisma,
} from "@prisma/client";

import {
  ZodError,
} from "zod";

import {
  AppError,
} from "@/lib/app-error";


//--------------------------------------------------
// Route Handler Types
//--------------------------------------------------

type RouteContext = {
  params?:
    Promise<
      Record<
        string,
        string
      >
    >;
};


type RouteHandler<
  TContext extends RouteContext =
    RouteContext
> = (
  request: NextRequest,
  context: TContext
) =>
  | Promise<Response>
  | Response;


//--------------------------------------------------
// Async Handler
//--------------------------------------------------

export function asyncHandler<
  TContext extends RouteContext =
    RouteContext
>(
  handler:
    RouteHandler<TContext>
) {

  return async (
    request: NextRequest,
    context: TContext
  ): Promise<Response> => {

    try {

      return await handler(
        request,
        context
      );

    } catch (error) {

      return handleRouteError(
        error
      );

    }

  };

}


//--------------------------------------------------
// Central Error Mapping
//--------------------------------------------------

function handleRouteError(
  error: unknown
): NextResponse {

  //----------------------------------------
  // Typed Application Error
  //----------------------------------------

  if (
    error instanceof
    AppError
  ) {

    return NextResponse.json(
      {
        success:
          false,

        message:
          error.message,

        code:
          error.code,

        details:
          error.details,
      },
      {
        status:
          error.statusCode,
      }
    );

  }


  //----------------------------------------
  // Zod Validation Error
  //----------------------------------------

  if (
    error instanceof
    ZodError
  ) {

    return NextResponse.json(
      {
        success:
          false,

        message:
          "Request validation failed",

        code:
          "VALIDATION_ERROR",

        details:
          error.flatten(),
      },
      {
        status:
          400,
      }
    );

  }


  //----------------------------------------
  // Prisma Known Errors
  //----------------------------------------

  if (
    error instanceof
    Prisma.PrismaClientKnownRequestError
  ) {

    if (
      error.code ===
      "P2025"
    ) {

      return NextResponse.json(
        {
          success:
            false,

          message:
            "Requested record was not found",

          code:
            "RECORD_NOT_FOUND",
        },
        {
          status:
            404,
        }
      );

    }


    if (
      error.code ===
      "P2002"
    ) {

      return NextResponse.json(
        {
          success:
            false,

          message:
            "A record with this value already exists",

          code:
            "DUPLICATE_RECORD",

          details:
            error.meta,
        },
        {
          status:
            409,
        }
      );

    }

  }


  //----------------------------------------
  // Unexpected Error
  //----------------------------------------

  console.error(
    "Unhandled API route error",
    {
      error:
        normalizeError(
          error
        ),
    }
  );


  return NextResponse.json(
    {
      success:
        false,

      message:
        "Internal server error",

      code:
        "INTERNAL_SERVER_ERROR",
    },
    {
      status:
        500,
    }
  );

}


//--------------------------------------------------
// Normalize Error For Logging
//--------------------------------------------------

function normalizeError(
  error: unknown
) {

  if (
    error instanceof
    Error
  ) {

    const errorWithCode =
      error as Error & {
        code?:
          string |
          number;
      };


    return {
      name:
        error.name,

      message:
        error.message,

      code:
        errorWithCode.code,

      stack:
        error.stack,
    };

  }


  return {
    message:
      String(
        error
      ),
  };

}