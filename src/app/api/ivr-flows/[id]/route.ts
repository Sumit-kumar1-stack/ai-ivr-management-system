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
          .findById(
            id
          );

      return success(
        flow
      );
    }
  );

//--------------------------------------------------
// PUT
//--------------------------------------------------

export const PUT =
  asyncHandler(
    async (
      request:
        NextRequest,

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

      const body =
        await request.json();

      const flow =
        await IVRFlowService
          .update(
            id,
            {
              name:
                typeof body.name ===
                  "string"
                  ? body.name
                  : undefined,

              description:
                body.description ===
                  null ||
                typeof body.description ===
                  "string"
                  ? body.description
                  : undefined,

              campaignId:
                body.campaignId ===
                  null ||
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
            }
          );

      return success(
        flow,
        "Flow updated successfully"
      );
    }
  );

//--------------------------------------------------
// DELETE
//--------------------------------------------------

export const DELETE =
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

      await IVRFlowService
        .delete(
          id
        );

      return success(
        null,
        "Flow deleted"
      );
    }
  );