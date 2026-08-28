import { NextResponse } from "next/server";

// The former unauthenticated RAG probe exposed indexed knowledge. Knowledge is
// now accessed only through tenant-authorized application routes.
export async function GET() {
  return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
}
