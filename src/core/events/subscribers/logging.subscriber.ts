import {

EventSubscriber,

AppEvent,

} from "@/core/events";

export class LoggingSubscriber {

static register() {

EventSubscriber.on(

AppEvent.CALL_STARTED,

payload => {

console.log(

"EVENT:",

payload

);

}

);

EventSubscriber.on(

AppEvent.CALL_COMPLETED,

payload => {

console.log(

"EVENT:",

payload

);

}

);

}

}