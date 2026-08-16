import {
  NextRequest,
} from "next/server";

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
// GET
//--------------------------------------------------

export const GET =
  asyncHandler(
    async () => {
      const flows =
        await IVRFlowService
          .findAll();

      return success(
        flows
      );
    }
  );

//--------------------------------------------------
// POST
//--------------------------------------------------

export const POST =
  asyncHandler(
    async (
      request:
        NextRequest
    ) => {
      const body =
        await request.json();

      const flow =
        await IVRFlowService
          .create({
            name:
              String(
                body.name ??
                  ""
              ),

            description:
              typeof body.description ===
                "string"
                ? body.description
                : undefined,

            campaignId:
              typeof body.campaignId ===
                "string"
                ? body.campaignId
                : undefined,

            nodes:
              Array.isArray(
                body.nodes
              )
                ? body.nodes
                : [],

            edges:
              Array.isArray(
                body.edges
              )
                ? body.edges
                : [],
          });

      return success(
        flow,
        "Flow created successfully"
      );
    }
  );