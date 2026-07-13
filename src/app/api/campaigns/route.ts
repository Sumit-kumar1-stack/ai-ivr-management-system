import { asyncHandler } from "@/lib/async-handler";

import { success } from "@/lib/api-response";

import { CampaignService } from "@/features/campaigns/campaign.service";

export const GET=

asyncHandler(async()=>{

const campaigns=

await CampaignService.getCampaigns();

return success(

campaigns,

"Campaigns fetched"

);

});

export const POST=

asyncHandler(async(req)=>{

const body=

await req.json();

const campaign=

await CampaignService.createCampaign(

body

);

return success(

campaign,

"Campaign created"

);

});