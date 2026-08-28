"use client";

import { useEffect, useState } from "react";

export function useCallDuration(

startedAt:number

){

const [duration,setDuration]=

useState(0);

useEffect(()=>{

const timer=

setInterval(()=>{

setDuration(

Math.floor(

(Date.now()-startedAt)/1000

)

);

},1000);

return()=>clearInterval(timer);

},[startedAt]);

return duration;

}