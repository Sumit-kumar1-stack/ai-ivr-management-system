import {
  AccountStatus,
  AuditEventOutcome,
  TenantStatus,
} from "@prisma/client";

import {
  NextResponse,
} from "next/server";

import {
  createRateLimitResponse,
  ensureRateLimit,
  readClientAddress,
} from "@/lib/abuse-control";

import {
  prisma,
} from "@/lib/prisma";

import {
  comparePassword,
} from "@/lib/hash";

import {
  signToken,
} from "@/lib/jwt";

import {
  AUTH_COOKIE_NAME,
} from "@/lib/auth";

import {
  LoginSchema,
} from "@/features/auth/auth.schema";

import {
  extractAuditRequestContext,
} from "@/services/audit/audit-context";

import {
  recordAuditEvent,
} from "@/services/audit/audit-event.service";

function isLoginEligibleTenantStatus(
  status: TenantStatus
) {
  return (
    status === TenantStatus.ACTIVE ||
    status === TenantStatus.TRIAL
  );
}

export async function POST(
  request: Request
) {
  try {
    const auditContext =
      extractAuditRequestContext(
        request
      );

    const body = await request.json();

    const parsed = LoginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid input",
        },
        {
          status: 400,
        }
      );
    }

    const { email, password } = parsed.data;

    await ensureRateLimit({
      scope: "auth-login",
      limit: 5,
      windowMs: 15 * 60 * 1000,
      keyParts: [
        readClientAddress(request),
        email,
      ],
    });

    const user = await prisma.user.findUnique({
      where: {
        email,
      },

      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        fullName: true,
        isActive: true,
        accountStatus: true,
        tenantId: true,
        tenant: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    if (
      user &&
      (
        !user.isActive ||
        user.accountStatus !== AccountStatus.ACTIVE ||
        (user.tenant && !isLoginEligibleTenantStatus(user.tenant.status))
      )
    ) {
      await recordAuditEvent({
        tenantId: user.tenantId ?? user.tenant?.id ?? "",
        actor: {
          id: user.id,
          role: user.role,
          tenantId: user.tenantId,
        },
        actorType: "USER",
        entityType: "AuthSession",
        resourceType: "User",
        resourceId: user.id,
        action: "LOGIN_FAILURE",
        outcome: AuditEventOutcome.FAILED,
        result: "FAILED",
        reason: "Account is inactive or tenant is not eligible for login",
        ipAddress: auditContext.ipAddress,
        correlationId: auditContext.correlationId,
      });
    }

    if (
      !user ||
      !user.isActive ||
      user.accountStatus !== AccountStatus.ACTIVE ||
      (user.tenant && !isLoginEligibleTenantStatus(user.tenant.status))
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid credentials",
        },
        {
          status: 401,
        }
      );
    }

    const validPassword = await comparePassword(password, user.password);

    if (!validPassword) {
      await recordAuditEvent({
        tenantId: user.tenantId ?? user.tenant?.id ?? "",
        actor: {
          id: user.id,
          role: user.role,
          tenantId: user.tenantId,
        },
        actorType: "USER",
        entityType: "AuthSession",
        resourceType: "User",
        resourceId: user.id,
        action: "LOGIN_FAILURE",
        outcome: AuditEventOutcome.FAILED,
        result: "FAILED",
        reason: "Invalid password",
        ipAddress: auditContext.ipAddress,
        correlationId: auditContext.correlationId,
      });

      return NextResponse.json(
        {
          success: false,
          message: "Invalid credentials",
        },
        {
          status: 401,
        }
      );
    }

    const token = signToken({
      userId: user.id,
      role: user.role,
    });

    await prisma.user.update({
      where: {
        id: user.id,
      },

      data: {
        lastLogin: new Date(),
      },
    });

    await recordAuditEvent({
      tenantId: user.tenantId ?? user.tenant?.id ?? "",
      actor: {
        id: user.id,
        role: user.role,
        tenantId: user.tenantId,
      },
      actorType: "USER",
      entityType: "AuthSession",
      resourceType: "User",
      resourceId: user.id,
      action: "LOGIN_SUCCESS",
      outcome: AuditEventOutcome.SUCCEEDED,
      result: "SUCCEEDED",
      ipAddress: auditContext.ipAddress,
      correlationId: auditContext.correlationId,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
      },
    });

    response.cookies.set(
      AUTH_COOKIE_NAME,
      token,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 8,
      }
    );

    return response;
  } catch (error) {
    const rateLimitResponse = createRateLimitResponse(error);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    console.error("Login failed", {
      error:
        error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        success: false,
        message: "Server error",
      },
      {
        status: 500,
      }
    );
  }
}
