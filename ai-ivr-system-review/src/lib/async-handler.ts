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

import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "async-route-handler"
  );

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

type RouteMetadata = {
  method:
    string;

  pathname:
    string;
};

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
    } catch (
      error
    ) {
      return handleRouteError(
        error,
        {
          method:
            request.method,

          /*
           * Do not log query parameters because they
           * may contain call IDs or other identifiers.
           */
          pathname:
            request.nextUrl.pathname,
        }
      );
    }
  };
}

//--------------------------------------------------
// Central Error Mapping
//--------------------------------------------------

function handleRouteError(
  error: unknown,
  route:
    RouteMetadata
): NextResponse {
  //----------------------------------------
  // Typed Application Error
  //----------------------------------------

  if (
    error instanceof
    AppError
  ) {
    if (
      error.statusCode >=
      500
    ) {
      log.error(
        {
          event:
            "api.application_error",

          method:
            route.method,

          pathname:
            route.pathname,

          statusCode:
            error.statusCode,

          applicationErrorCode:
            error.code,
        },
        "API application error"
      );
    }

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

  log.error(
    {
      event:
        "api.unhandled_error",

      method:
        route.method,

      pathname:
        route.pathname,

      error:
        normalizeError(
          error
        ),
    },
    "Unhandled API route error"
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