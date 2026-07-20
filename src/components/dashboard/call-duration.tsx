"use client";

import { useCallDuration }

from "@/hooks/use-call-duration";

export default function CallDuration({

startedAt,

}:{

startedAt:number

}){

const sec=

useCallDuration(

startedAt

);

const minutes=

String(

Math.floor(sec/60)

).padStart(2,"0");

const seconds=

String(

sec%60

).padStart(2,"0");

return(

<div className="text-sm font-medium">

{minutes}:{seconds}

</div>

);

}