import {
  EventRegistry,
} from "./events";

import {
  TranscriptSubscriber,
} from "@/services/speech/transcript.subscriber";

import {

  RealtimeSubscriber,

} from "@/services/realtime/realtime-subscriber";

let initialized = false;

export function bootstrap() {

  if (initialized) {
    return;
  }

  initialized = true;

  EventRegistry.initialize();

  TranscriptSubscriber.register();

  RealtimeSubscriber.register();

  console.log("✅ Application Bootstrapped");

}