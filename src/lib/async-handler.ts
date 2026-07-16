import { NextRequest, NextResponse } from "next/server";

import { AppError } from "./errors";

import {
  createRequestLogger,
} from "./logger";

import {
  generateRequestId,
} from "./request-id";

type RouteHandler = (
  ...args: any[]
) => Promise<Response>;

export function asyncHandler<T extends RouteHandler>(
  handler: T
): T {

  return (async (
    ...args: Parameters<T>
  ): Promise<Response> => {

    const request =
      args[0] as Request | NextRequest;

    const requestId =
      generateRequestId();

    const log =
      createRequestLogger(
        requestId
      );

    const start =
      performance.now();

    log.info({

      message: "Incoming Request",

      requestId,

      method: request.method,

      url: request.url,

    });

    try {

      const response =
        await handler(...args);

      const duration =
        performance.now() - start;

      log.info({

        message: "Request Completed",

        requestId,

        status: response.status,

        duration: `${duration.toFixed(2)} ms`,

      });

      response.headers.set(
        "x-request-id",
        requestId
      );

      return response;

    } catch (err) {

      const duration =
        performance.now() - start;

      if (err instanceof AppError) {

        log.warn({

          message: err.message,

          requestId,

          status: err.statusCode,

          duration: `${duration.toFixed(2)} ms`,

        });

        return NextResponse.json(
          {
            success: false,
            message: err.message,
          },
          {
            status: err.statusCode,
            headers: {
              "x-request-id": requestId,
            },
          }
        );

      }

      log.error({

        message: "Unhandled Error",

        requestId,

        duration: `${duration.toFixed(2)} ms`,

        error:
          err instanceof Error
            ? {
                name: err.name,
                message: err.message,
                stack: err.stack,
              }
            : err,

      });

      return NextResponse.json(
        {
          success: false,
          message: "Internal Server Error",
        },
        {
          status: 500,
          headers: {
            "x-request-id": requestId,
          },
        }
      );

    }

  }) as T;

}