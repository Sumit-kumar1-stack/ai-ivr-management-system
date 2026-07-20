import { getIO } from "@/server/socket";

export class RealtimeService {

  //----------------------------------

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

  //----------------------------------

  static transcript(
    callId: string,
    text: string
  ) {

    this.emit(
      "transcript",
      {
        callId,
        text,
      }
    );

  }

  //----------------------------------

  static state(
    callId: string,
    state: string
  ) {

    this.emit(
      "state",
      {
        callId,
        state,
      }
    );

  }

  //----------------------------------

  static assistant(
    callId: string,
    text: string
  ) {

    this.emit(
      "assistant",
      {
        callId,
        text,
      }
    );

  }

  //----------------------------------

  static completed(
    callId: string
  ) {

    this.emit(
      "completed",
      {
        callId,
      }
    );

  }

}