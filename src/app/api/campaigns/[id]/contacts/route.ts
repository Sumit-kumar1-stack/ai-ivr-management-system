import { success } from "@/lib/api-response";
import { CampaignContactService } from "@/features/campaigns/campaign-contact.service";
import { asyncHandler } from "@/lib/async-handler";

export const GET = asyncHandler(
  async (
    req: Request,
    {
      params,
    }: {
      params: Promise<{ id: string }>;
    }
  ) => {
    const { id } = await params;

    const contacts =
      await CampaignContactService.getCampaignContacts(id);

    return success(
      contacts,
      "Campaign contacts fetched"
    );
  }
);

export const POST = asyncHandler(
  async (
    req: Request,
    {
      params,
    }: {
      params: Promise<{ id: string }>;
    }
  ) => {
    const { id } = await params;

    const body = await req.json();

    const result =
      await CampaignContactService.assignContacts(
        id,
        body
      );

    return success(
      result,
      "Contacts assigned successfully"
    );
  }
);