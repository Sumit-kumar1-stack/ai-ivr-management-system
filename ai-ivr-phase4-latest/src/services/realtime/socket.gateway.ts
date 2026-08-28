import { SocketService } from "./socket.service";

export class SocketGateway {

  static broadcast(

    event: string,

    payload: unknown

  ) {

    SocketService.emit(

      event,

      payload

    );

  }

}