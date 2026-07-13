import { prisma } from "@/lib/prisma";

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

create(data:any){

return prisma.campaign.create({

data,

});

},

update(id:string,data:any){

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