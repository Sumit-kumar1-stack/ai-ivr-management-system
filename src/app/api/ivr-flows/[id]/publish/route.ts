import {
  success,
} from "@/lib/api-response";

import {
  asyncHandler,
} from "@/lib/async-handler";

import {
  IVRFlowService,
} from "@/services/ivr-flow.service";

//--------------------------------------------------
// POST /api/ivr-flows/:id/publish
//--------------------------------------------------

export const POST =
  asyncHandler(
    async (
      _request,
      {
        params,
      }: {
        params:
          Promise<{
            id:
              string;
          }>;
      }
    ) => {
      const {
        id,
      } =
        await params;

      const flow =
        await IVRFlowService
          .publish(
            id
          );

      return success(
        flow,
        "IVR flow published successfully"
      );
    }
  );