import {
  UserRole,
} from "@prisma/client";

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
  requireRole,
} from "@/lib/auth";

import {
  IVRFlowService,
} from "@/services/ivr-flow.service";

import {
  assertIvrFlowOwnership,
} from "@/services/security/tenant-access.service";

const FLOW_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

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
      const currentUser = await requireRole(FLOW_ROLES);

      const {
        id,
      } =
        await params;

      await assertIvrFlowOwnership(
        id,
        currentUser
      );

      const flow =
        await IVRFlowService
          .findById(
            id,
            currentUser.role === UserRole.SUPER_ADMIN
              ? undefined
              : currentUser.id
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
      const currentUser = await requireRole(FLOW_ROLES);

      const {
        id,
      } =
        await params;

      const body =
        await request.json();

      await assertIvrFlowOwnership(
        id,
        currentUser
      );

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
      const currentUser = await requireRole(FLOW_ROLES);

      const {
        id,
      } =
        await params;

      await assertIvrFlowOwnership(
        id,
        currentUser
      );

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
