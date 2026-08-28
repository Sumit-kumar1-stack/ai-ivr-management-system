"use client";

import ConversationMessage from "./conversation-message";

import {

useDashboardStore

}

from "@/store/dashboard.store";

export default function Transcript({

callId,

}:{

callId:string

}){

const conversation=

useDashboardStore(

s=>

s.conversations[callId]

);

if(!conversation){

return null;

}

return(

<div className="space-y-3">

{

conversation.messages.map(

message=>(

<ConversationMessage

key={message.id}

role={message.role}

content={message.content}

/>

)

)

}

</div>

);

}