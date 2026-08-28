import { eventBus } from "./event-bus";
import { SocketEvents } from "@/server/socket-events";

export class SocketGatewayService {

  static initialize() {

    eventBus.onAny(

      (
        event: string | string[],
        payload: unknown
      ) => {

        SocketEvents.emit(
          Array.isArray(event) ? event.join(".") : event,
          payload
        );

      }

    );

  }

}