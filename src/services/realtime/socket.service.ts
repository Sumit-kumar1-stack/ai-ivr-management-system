import { getIO } from "@/server/socket";

export class SocketService {

  static emit(
    event: string,
    payload: unknown
  ) {

    try {

      getIO().emit(
        event,
        payload
      );

    }

    catch {

      // Socket not initialized yet

    }

  }

}