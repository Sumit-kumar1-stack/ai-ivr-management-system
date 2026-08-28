import { NextRequest, NextResponse } from "next/server";
import { generateRequestId } from "@/lib/request-id";

export function withRequestId(request: NextRequest) {
  const requestId = generateRequestId();

  const response = NextResponse.next();

  response.headers.set("x-request-id", requestId);

  return response;
}