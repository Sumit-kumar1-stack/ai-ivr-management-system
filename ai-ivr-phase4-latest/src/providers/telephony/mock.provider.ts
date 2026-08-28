import { randomUUID } from "crypto";

import { createCallLogger } from "@/lib/logger";

import { BaseTelephonyProvider } from "./base.provider";


import {
  getCallByProviderId,
  updateCallStatus,
} from "@/services/calls/call.service";


import {
  EventPublisher,
  AppEvent,
} from "@/core/events";


import {
  CallPayload,
} from "@/core/events/payloads/call.payload";


import {
  SilenceDetector,
} from "@/services/conversations/silence-detector.service";


import {
  PartialTranscriptService,
} from "@/services/conversations/partial-transcript.service";


import {
  BargeInService,
} from "@/services/voice/barge-in.service";


import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";


import {
  ConversationEvents,
} from "@/services/conversations/conversation-events.service";


import {
 ProviderCallRequest,
 CallResponse,
} from "@/services/telephony/types";



function sleep(ms:number){

  return new Promise(
    resolve=>setTimeout(resolve,ms)
  );

}



export class MockProvider 
extends BaseTelephonyProvider {



async makeCall(
 request: ProviderCallRequest
): Promise<CallResponse>{



const providerCallId =
    randomUUID();


const callId =
    request.callId;



const log =
 createCallLogger(
   providerCallId
 );



/*
|--------------------------------------------------------------------------
| CALL STARTED
|--------------------------------------------------------------------------
*/


await EventPublisher.publish<CallPayload>(
 AppEvent.CALL_STARTED,
 {

   callId,

   timestamp:
    new Date(),

   metadata:{
     providerCallId
   }

 }
);



log.info(
 {
   to:request.to
 },
 "Outbound call requested"
);




/*
|--------------------------------------------------------------------------
| RINGING
|--------------------------------------------------------------------------
*/


setTimeout(async()=>{


try{


await EventPublisher.publish<CallPayload>(
 AppEvent.CALL_RINGING,
 {
   callId,

   timestamp:
    new Date(),

   metadata:{
     providerCallId
   }
 }
);



await updateCallStatus({

 providerCallId,

 status:"ringing"

});



}
catch(error){


log.error(
 {
   error
 },
 "Ringing update failed"
);


}



},2000);





/*
|--------------------------------------------------------------------------
| ANSWERED
|--------------------------------------------------------------------------
*/


setTimeout(async()=>{


try{



await EventPublisher.publish<CallPayload>(
 AppEvent.CALL_ANSWERED,
 {

   callId,

   timestamp:
    new Date(),

   metadata:{
     providerCallId
   }

 }
);




await updateCallStatus({

 providerCallId,

 status:"answered"

});




const call =
 await getCallByProviderId(
   providerCallId
 );



if(!call){


log.error(
 "Call record not found"
);


return;


}




/*
|--------------------------------------------------------------------------
| Conversation Started
|--------------------------------------------------------------------------
*/


ConversationStateService.setState(
 call.id,
 "LISTENING"
);



ConversationEvents.emit(
 "listening",
 call.id
);



PartialTranscriptService.clear(
 call.id
);





/*
|--------------------------------------------------------------------------
| Fake Streaming Speech To Text
|--------------------------------------------------------------------------
*/


const partials=[


"What",

"What is",

"What is the",

"What is the interest",

"What is the interest rate?"

];



let processed=false;



for(
 const partial of partials
){



log.debug(
 {
  partial
 },
 "Partial transcript received"
);




/*
| Barge in detection
*/


BargeInService.interrupt(
 call.id
);




/*
| Update transcript
*/


PartialTranscriptService.update(
 call.id,
 partial
);




/*
| Silence detection
*/


SilenceDetector.reset(

 call.id,


async()=>{


if(processed)
return;


processed=true;



log.info(
 "User finished speaking"
);




ConversationStateService.setState(
 call.id,
 "THINKING"
);



await EventPublisher.publish<CallPayload>(
 AppEvent.VOICE_THINKING,
 {

  callId:
    call.id,


  timestamp:
    new Date()

 }
);




ConversationEvents.emit(
 "thinking",
 call.id
);




const transcript =
 PartialTranscriptService.get(
   call.id
 );



PartialTranscriptService.clear(
 call.id
 );




if(!transcript.trim()){


log.warn(
 "Empty transcript ignored"
);

return;

}

}

);

await sleep(600);

}

}
catch(error){


log.error(
 {
  error
 },
 "Answered flow failed"
);


}



},5000);







/*
|--------------------------------------------------------------------------
| COMPLETED
|--------------------------------------------------------------------------
*/


setTimeout(async()=>{


try{



await EventPublisher.publish<CallPayload>(
 AppEvent.CALL_COMPLETED,
 {

  callId,

  timestamp:
    new Date(),

  metadata:{
    providerCallId
  }

 }
);



await updateCallStatus({

 providerCallId,

 status:"completed",

 duration:30

});




const call =
 await getCallByProviderId(
   providerCallId
 );



if(call){


ConversationStateService.setState(
 call.id,
 "IDLE"
);



ConversationEvents.emit(
 "idle",
 call.id
);



PartialTranscriptService.clear(
 call.id
);



}



log.info(
 {
  duration:30
 },
 "Mock call completed successfully"
);



}
catch(error){



await EventPublisher.publish<CallPayload>(
 AppEvent.CALL_FAILED,
 {

  callId,

  timestamp:
    new Date(),


  metadata:{
    error
  }


 }
);



log.error(
 {
  error
 },
 "Mock call failed"
);



}



},20000);





return {


callId:
 providerCallId,


status:
 "queued"


};



}

async handleWebhook(
    body: unknown
) {

    console.log(
        "Mock webhook",
        body
    );

}




async endCall(
 callId:string
){



await EventPublisher.publish<CallPayload>(
 AppEvent.CALL_COMPLETED,
 {

  callId,

  timestamp:
    new Date()

 }
);



const log =
createCallLogger(callId);



log.info(
 "Ending mock call"
);



}



}