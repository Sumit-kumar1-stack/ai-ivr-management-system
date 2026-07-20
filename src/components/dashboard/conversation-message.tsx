"use client";

export default function ConversationMessage({

role,

content,

}:{

role:string;

content:string;

}){

return(

<div
className={`

rounded-lg

p-3

${
role==="assistant"

?"bg-indigo-500/10"

:"bg-slate-500/10"

}

`}

>

<div
className="text-xs opacity-60 mb-1"
>

{role.toUpperCase()}

</div>

<div>

{content}

</div>

</div>

);

}