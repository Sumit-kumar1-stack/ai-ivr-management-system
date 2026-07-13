import { NextRequest } from "next/server";
import { success } from "@/lib/api-response";
import { asyncHandler } from "@/lib/async-handler";

import { IVRFlowService } from "@/services/ivr-flow.service";

export const GET = asyncHandler(
  async (
    req,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const { id } = await params;

    const flow = await IVRFlowService.findById(id);

    return success(flow);
  }
);

export const PUT = asyncHandler(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const { id } = await params;

    const body = await req.json();

    const flow = await IVRFlowService.update(id, body);

    return success(flow);
  }
);

export const DELETE = asyncHandler(
  async (
    req,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const { id } = await params;

    await IVRFlowService.delete(id);

    return success(null, "Flow deleted");
  }
);