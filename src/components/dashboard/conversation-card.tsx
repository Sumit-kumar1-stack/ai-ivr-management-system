"use client";

import Transcript from "./transcript";

import Waveform from "./waveform";

import ThinkingAnimation from "./thinking-animation";

import StatusBadge from "./status-badge";

import CallDuration from "./call-duration";

import {

ActiveCall

}

from "@/store/dashboard.store";

export default function ConversationCard({

call,

}:{

call:ActiveCall

}){

return(

<div className="rounded-xl border p-5">

<div className="flex justify-between">

<div>

<div className="font-semibold">

{call.phone}

</div>

<div>

<CallDuration

startedAt={call.startedAt}

/>

</div>

</div>

<StatusBadge

status={call.status}

/>

</div>

<div className="mt-4">

{

call.status==="AI Thinking"&&

<ThinkingAnimation/>

}

{

call.status==="AI Speaking"&&

<Waveform/>

}

</div>

<div className="mt-5">

<Transcript

callId={call.id}

/>

</div>

</div>

);

}