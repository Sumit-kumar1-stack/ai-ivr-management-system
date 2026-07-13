import { CampaignRepository } from "./campaign.repository";

import { CreateCampaignSchema } from "./campaign.schema";

import { toCampaignDTO } from "./campaign.mapper";

export const CampaignService={

async getCampaigns(){

const list=

await CampaignRepository.findAll();

return list.map(

toCampaignDTO

);

},

async createCampaign(

input:unknown

){

const data=

CreateCampaignSchema.parse(

input

);

const campaign=

await CampaignRepository.create(

data

);

return toCampaignDTO(

{

...campaign,

contacts:[],

}

);

},

};