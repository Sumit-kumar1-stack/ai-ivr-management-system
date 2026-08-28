import { getIO } from "@/server/socket";

export class RealtimeEmitter {

  static emit(
    event: string,
    payload: unknown
  ) {

    try {

      const io = getIO();

      io.emit(
        event,
        payload
      );

    } catch {

      // Socket server not started yet

    }

  }

}