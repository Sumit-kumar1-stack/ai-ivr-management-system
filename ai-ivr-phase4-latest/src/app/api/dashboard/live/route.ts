import { UserRole } from "@prisma/client";

import { success } from "@/lib/api-response";
import { asyncHandler } from "@/lib/async-handler";
import { requireRole } from "@/lib/auth";
import { DashboardService } from "@/features/dashboard";

const DASHBOARD_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.AGENT,
] as const;

export const GET = asyncHandler(

  async ()=>{
    const currentUser = await requireRole(DASHBOARD_ROLES);

    const result =
      await DashboardService.getLiveDashboard(
        currentUser.role === UserRole.SUPER_ADMIN
          ? undefined
          : currentUser.id
      );

    return success(
      result,
      "Dashboard loaded"
    );

  }

);
