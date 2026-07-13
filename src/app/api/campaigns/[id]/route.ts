import { asyncHandler } from "@/lib/async-handler";
import { success } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export const GET = asyncHandler(
  async (
    req,
    { params }: {
      params: Promise<{ id: string }>;
    }
  ) => {

    const { id } = await params;

    const campaign =
      await prisma.campaign.findUnique({

        where:{
          id,
        },

        include:{
          contacts:true,
        },

      });

    return success(campaign);
  }
);