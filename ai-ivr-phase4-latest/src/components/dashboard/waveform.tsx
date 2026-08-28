"use client";

export default function Waveform(){

return(

<div className="flex items-end gap-1 h-10">

{

Array.from({length:12}).map(

(_,i)=>(

<div

key={i}

className="w-1 rounded bg-green-500 animate-pulse"

style={{

height:`${15+i*3}px`

}}

/>

)

)

}

</div>

);

}