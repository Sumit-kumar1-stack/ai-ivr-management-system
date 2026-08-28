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

const FLOW_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.AGENT,
] as const;

const FLOW_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

//--------------------------------------------------
// GET
//--------------------------------------------------

export const GET =
  asyncHandler(
    async () => {
      const currentUser = await requireRole(FLOW_READ_ROLES);

      const flows =
        await IVRFlowService
          .findAll(
            currentUser.role === UserRole.SUPER_ADMIN
              ? undefined
              : currentUser.id
          );

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
      const currentUser = await requireRole(FLOW_WRITE_ROLES);

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

            ownerUserId:
              currentUser.role === UserRole.SUPER_ADMIN
                ? undefined
                : currentUser.id,
          });

      return success(
        flow,
        "Flow created successfully"
      );
    }
  );
