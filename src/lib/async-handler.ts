import { NextResponse } from "next/server";
import { AppError } from "./errors";
import { logger } from "./logger";

export function asyncHandler<
  T extends (...args: any[]) => Promise<any>
>(handler: T) {
  return async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (err) {
      logger.error("API Error", err);

      if (err instanceof AppError) {
        return NextResponse.json(
          {
            success: false,
            message: err.message,
          },
          {
            status: err.statusCode,
          }
        );
      }

      return NextResponse.json(
        {
          success: false,
          message: "Internal Server Error",
        },
        {
          status: 500,
        }
      );
    }
  };
}