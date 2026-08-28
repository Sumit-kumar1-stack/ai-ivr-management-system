export default function CampaignSkeleton(){

return(

<div className="space-y-5">

<div className="h-12 bg-gray-200 rounded animate-pulse"/>

<div className="grid grid-cols-4 gap-5">

{Array.from({length:4}).map((_,i)=>(

<div

key={i}

className="h-32 rounded bg-gray-200 animate-pulse"

/>

))}

</div>

</div>

);

}