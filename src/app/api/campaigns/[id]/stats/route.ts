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

    const assigned =
      await prisma.campaignContact.count({
        where: {
          campaignId: id,
        },
      });

    const pending =
      await prisma.campaignContact.count({
        where: {
          campaignId: id,
          contact: {
            status: "PENDING",
          },
        },
      });

    const answered =
      await prisma.campaignContact.count({
        where: {
          campaignId: id,
          contact: {
            status: "ANSWERED",
          },
        },
      });

    const failed =
      await prisma.campaignContact.count({
        where: {
          campaignId: id,
          contact: {
            status: "FAILED",
          },
        },
      });

    return success({
      assigned,
      pending,
      answered,
      failed,
    });
  }
);