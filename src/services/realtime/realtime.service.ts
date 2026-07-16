import { eventBus } from "./event-bus";


export class RealtimeService {

  static publish(
    event: string,
    payload: unknown
  ) {

    eventBus.emit(
      event,
      payload
    );

  }

  static subscribe(
    event: string,
    listener: (payload: unknown) => void
  ) {

    eventBus.on(
      event,
      listener
    );

  }

  static unsubscribe(
    event: string,
    listener: (payload: unknown) => void
  ) {

    eventBus.off(
      event,
      listener
    );

  }

}