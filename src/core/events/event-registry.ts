import {
  TimelineSubscriber,
  LoggingSubscriber,
  RealtimeSubscriber,
} from "./subscribers";

export class EventRegistry {

  static initialize() {

    TimelineSubscriber.register();

    LoggingSubscriber.register();

    RealtimeSubscriber.register();

    console.log(
      "All Event Subscribers Registered"
    );

  }

}