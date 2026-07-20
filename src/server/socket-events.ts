import { getIO } from "./socket";

export class SocketEvents {
  static emit(
    event: string,
    payload: unknown
  ) {
    console.log(
      `📡 Socket Event: ${event}`,
      payload
    );

    try {
      const io = getIO();

      io.emit(
        event,
        payload
      );
    } catch (error) {
      console.warn(
        "⚠️ Socket server not initialized",
        error
      );
    }
  }
}