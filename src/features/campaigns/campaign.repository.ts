import { prisma } from "@/lib/prisma";
import type { CreateCampaignInput } from "./campaign.schema";
import type { Prisma } from "@prisma/client";

export const CampaignRepository={

findAll(){

return prisma.campaign.findMany({

include:{

contacts:true,

},

orderBy:{

createdAt:"desc",

},

});

},

findById(id:string){

return prisma.campaign.findUnique({

where:{id},

include:{

contacts:true,

},

});

},

create(data: CreateCampaignInput){

return prisma.campaign.create({

data,

});

},

update(id:string,data: Prisma.CampaignUpdateInput){

return prisma.campaign.update({

where:{id},

data,

});

},

delete(id:string){

return prisma.campaign.delete({

where:{id},

});

},

};
