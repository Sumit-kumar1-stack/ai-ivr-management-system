import {
  EventSubscriber,
  AppEvent,
} from "@/core/events";

import { SocketGateway } from "@/services/realtime/socket.gateway";

export class RealtimeSubscriber {

  static register() {

    for (const event of EventSubscriber.events()) {

      EventSubscriber.on(
        event,
        (payload) => {

          SocketGateway.broadcast(
            event,
            payload
          );

        }
      );

    }

  }

}