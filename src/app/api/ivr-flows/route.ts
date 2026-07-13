import { NextRequest } from "next/server";
import { success } from "@/lib/api-response";
import { asyncHandler } from "@/lib/async-handler";

import { IVRFlowService } from "@/services/ivr-flow.service";

export const GET = asyncHandler(async () => {
  const flows = await IVRFlowService.findAll();

  return success(flows);
});

export const POST = asyncHandler(async (req: NextRequest) => {
  const body = await req.json();

  const flow = await IVRFlowService.create(body);

  return success(flow, "Flow created successfully");
});