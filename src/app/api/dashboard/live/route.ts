import { success } from "@/lib/api-response";
import { asyncHandler } from "@/lib/async-handler";
import { DashboardService } from "@/features/dashboard";

export const GET = asyncHandler(

  async ()=>{

    const result =
      await DashboardService.getLiveDashboard();

    return success(
      result,
      "Dashboard loaded"
    );

  }

);