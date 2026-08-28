import { NextResponse } from "next/server";

// Outbound calls are started only by the authenticated campaign runner and
// retry worker. This legacy public endpoint must never dispatch provider calls.
export async function POST() {
  return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
}
