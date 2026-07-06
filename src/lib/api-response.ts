import { NextResponse } from "next/server";
import { ApiResponse } from "@/types/api";

export function success<T>(
  data: T,
  message = "Success",
  meta?: ApiResponse["meta"]
) {
  return NextResponse.json<ApiResponse<T>>({
    success: true,
    message,
    data,
    meta,
  });
}

export function error(
  message = "Something went wrong",
  status = 500
) {
  return NextResponse.json<ApiResponse>({
    success: false,
    message,
  }, {
    status,
  });
}