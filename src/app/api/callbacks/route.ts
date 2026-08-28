import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAuthenticationError, isAuthorizationError, requireRole } from "@/lib/auth";
import { listTenantCallbacks } from "@/services/telephony/callback-request.service";
import { toSafeCallbackView } from "@/services/telephony/callback-safe-view.service";

const CALLBACK_READ_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AGENT] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireRole(CALLBACK_READ_ROLES);
    const tenantId = tenantScope(user, request);
    if (!tenantId) return NextResponse.json({ success: false, message: "A tenant scope is required." }, { status: 403 });
    const callbacks = await listTenantCallbacks(tenantId);
    return NextResponse.json({ success: true, data: callbacks.map(toSafeCallbackView) });
  } catch (error) {
    const status = isAuthenticationError(error) ? 401 : isAuthorizationError(error) ? 403 : 500;
    return NextResponse.json({ success: false, message: status === 401 ? "Authentication required." : status === 403 ? "You do not have permission." : "Unable to load callbacks." }, { status });
  }
}

function tenantScope(user: { role: UserRole; tenantId: string | null }, request: NextRequest): string | null {
  const requested = request.nextUrl.searchParams.get("tenantId")?.trim() || null;
  if (user.role === UserRole.SUPER_ADMIN) return requested;
  return user.tenantId && (!requested || requested === user.tenantId) ? user.tenantId : null;
}
