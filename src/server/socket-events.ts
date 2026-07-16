import { io } from "./server";

export class SocketEvents {

  static emit(
    event: string,
    payload: unknown
  ) {

    console.log(
      `📡 ${event}`,
      payload
    );

    io.emit(
      event,
      payload
    );

  }

}