import { CampaignRepository } from "./campaign.repository";

import { CreateCampaignSchema } from "./campaign.schema";

import { toCampaignDTO } from "./campaign.mapper";

export const CampaignService={

async getCampaigns(ownerUserId?: string){

const list=

await CampaignRepository.findAll(ownerUserId);

return list.map(

toCampaignDTO

);

},

async createCampaign(

input:unknown,
ownerUserId?: string

){

const data=

CreateCampaignSchema.parse(

input

);

const campaign=

await CampaignRepository.create(

 {
  ...data,
  ownerUserId,
 }

);

return toCampaignDTO(

{

...campaign,

contacts:[],

}

);

},

};
