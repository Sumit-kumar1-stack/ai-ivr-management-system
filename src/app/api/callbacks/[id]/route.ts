import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAuthenticationError, isAuthorizationError, requireRole } from "@/lib/auth";
import { getTenantCallback, updateCallbackLifecycle } from "@/services/telephony/callback-request.service";
import { toSafeCallbackView } from "@/services/telephony/callback-safe-view.service";

const CALLBACK_READ_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AGENT] as const;
const CALLBACK_WRITE_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN] as const;
type Context = { params: Promise<{ id: string }> };
type Action = "confirm" | "claim" | "schedule" | "complete" | "fail" | "cancel";

export async function GET(request: NextRequest, context: Context): Promise<NextResponse> {
  try {
    const user = await requireRole(CALLBACK_READ_ROLES);
    const tenantId = tenantScope(user, request);
    const id = (await context.params).id.trim();
    if (!tenantId || !id) return NextResponse.json({ success: false, message: "Callback not found." }, { status: 404 });
    const callback = await getTenantCallback(tenantId, id);
    return callback ? NextResponse.json({ success: true, data: toSafeCallbackView(callback) }) : NextResponse.json({ success: false, message: "Callback not found." }, { status: 404 });
  } catch (error) {
    const status = isAuthenticationError(error) ? 401 : isAuthorizationError(error) ? 403 : 500;
    return NextResponse.json({ success: false, message: status === 401 ? "Authentication required." : status === 403 ? "You do not have permission." : "Unable to load callback." }, { status });
  }
}

export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  try {
    const user = await requireRole(CALLBACK_WRITE_ROLES);
    const tenantId = tenantScope(user, request);
    const id = (await context.params).id.trim();
    const body = await request.json() as { action?: unknown; failureReason?: unknown };
    const action = typeof body.action === "string" ? body.action : "";
    if (!tenantId || !id || !["confirm", "claim", "schedule", "complete", "fail", "cancel"].includes(action)) return NextResponse.json({ success: false, message: "Invalid callback action." }, { status: 400 });
    const callback = await updateCallbackLifecycle(tenantId, id, action as Action, typeof body.failureReason === "string" ? body.failureReason : undefined);
    return NextResponse.json({ success: true, data: toSafeCallbackView(callback) });
  } catch (error) {
    if (error instanceof Error && error.message === "CALLBACK_NOT_FOUND") return NextResponse.json({ success: false, message: "Callback not found." }, { status: 404 });
    if (error instanceof Error && error.message === "CALLBACK_CONFIRMATION_REQUIRED") return NextResponse.json({ success: false, message: "Callback transition is not allowed." }, { status: 409 });
    const status = isAuthenticationError(error) ? 401 : isAuthorizationError(error) ? 403 : 500;
    return NextResponse.json({ success: false, message: status === 401 ? "Authentication required." : status === 403 ? "You do not have permission." : "Unable to update callback." }, { status });
  }
}

function tenantScope(user: { role: UserRole; tenantId: string | null }, request: NextRequest): string | null {
  const requested = request.nextUrl.searchParams.get("tenantId")?.trim() || null;
  if (user.role === UserRole.SUPER_ADMIN) return requested;
  return user.tenantId && (!requested || requested === user.tenantId) ? user.tenantId : null;
}
