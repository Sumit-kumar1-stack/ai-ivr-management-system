"use client";

const colors={

Started:"bg-blue-500",

Ringing:"bg-yellow-500",

Answered:"bg-green-500",

"AI Thinking":"bg-orange-500",

"AI Speaking":"bg-purple-500",

Listening:"bg-cyan-500",

Completed:"bg-gray-500",

};

export default function StatusBadge({

status,

}:{

status:string

}){

return(

<span

className={`

px-3

py-1

rounded-full

text-white

text-xs

${colors[status as keyof typeof colors]??"bg-slate-500"}

`}

>

{status}

</span>

);

}