export function toCampaignDTO(

campaign:any

){

return{

id:

campaign.id,

name:

campaign.name,

description:

campaign.description,

language:

campaign.language,

voice:

campaign.voice,

status:

campaign.status,

createdAt:

campaign.createdAt.toISOString(),

contactCount:

campaign.contacts.length,

};

}