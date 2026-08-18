import {
  NextRequest,
  NextResponse,
} from "next/server";


import {
  asyncHandler,
} from "@/lib/async-handler";


import {
  requireRole,
} from "@/lib/auth";


import {
  startCampaignExecution,
} from "@/services/campaigns/campaign-start.service";


//--------------------------------------------------
// Context
//--------------------------------------------------


interface RouteContext {
  params:
    Promise<{
      id:
        string;
    }>;
}


//--------------------------------------------------
// Start
//--------------------------------------------------


export const POST =
  asyncHandler<RouteContext>(
    async (
      _request:
        NextRequest,


      context:
        RouteContext
    ) => {
      await requireRole([
        "ADMIN",
        "SUPER_ADMIN",
      ]);


      const {
        id,
      } =
        await context.params;


      const result =
        await startCampaignExecution(
          id
        );


      return NextResponse.json(
        {
          success:
            true,


          message:
            result.scheduled
              ? "Campaign scheduled successfully"
              : "Campaign queued successfully",


          data:
            result,
        },
        {
          status:
            202,


          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }
  );