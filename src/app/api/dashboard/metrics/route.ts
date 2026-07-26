import {
  DashboardService,
} from "@/features/dashboard";

import {
  success,
} from "@/lib/api-response";

import {
  asyncHandler,
} from "@/lib/async-handler";

export const GET =
  asyncHandler(
    async () => {
      const result =
        await DashboardService.getLiveDashboard();

      return success(
        result,
        "Dashboard metrics loaded"
      );
    }
  );