import { NextRequest } from "next/server";
import { asyncHandler } from "@/lib/async-handler";
import { success } from "@/lib/api-response";
import { CampaignContactService } from "@/features/campaigns/campaign-contact.service";

export const DELETE = asyncHandler(
  async (
    _req: NextRequest,
    {
      params,
    }: {
      params: Promise<{
        id: string;
        contactId: string;
      }>;
    }
  ) => {
    const { id, contactId } = await params;

    const result =
      await CampaignContactService.removeContact(
        id,
        contactId
      );

    return success(
      result,
      "Contact removed successfully"
    );
  }
);