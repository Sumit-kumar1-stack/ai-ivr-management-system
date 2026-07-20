import { eventBus } from "./event-bus";
import { AppEvent } from "./event-types";

export class EventSubscriber {

  static on<T>(
    event: AppEvent,
    listener: (payload: T) => void
  ) {
    eventBus.on(event, listener);
  }

  static once<T>(
    event: AppEvent,
    listener: (payload: T) => void
  ) {
    eventBus.once(event, listener);
  }

  static off<T>(
    event: AppEvent,
    listener: (payload: T) => void
  ) {
    eventBus.off(event, listener);
  }

  static events(): AppEvent[] {
    return Object.values(AppEvent);
  }

}