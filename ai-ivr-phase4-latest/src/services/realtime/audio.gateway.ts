import { Server } from "socket.io";

import { AudioRouter } from

"@/services/voice/audio-router.service";

export function registerAudioGateway(

io: Server

){

io.on(

"connection",

socket=>{

socket.on(

"audio",

async payload=>{

await AudioRouter.routeIncoming(

payload

);

}

);

}

);

}