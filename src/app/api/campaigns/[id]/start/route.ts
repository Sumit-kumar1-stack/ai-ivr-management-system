import { NextResponse } from "next/server";

import { runCampaign } from "@/services/campaigns/campaign-runner.service";

interface Params {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(
  request: Request,
  { params }: Params
) {
  try {
    const { id } = await params;

    const result = await runCampaign(id);

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "Failed to start campaign",
      },
      {
        status: 500,
      }
    );
  }
}