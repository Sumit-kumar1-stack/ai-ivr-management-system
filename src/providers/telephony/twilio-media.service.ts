import WebSocket from "ws";

class TwilioMediaService {

  private sockets =
    new Map<string, WebSocket>();

  register(
    callId: string,
    socket: WebSocket
  ) {

    this.sockets.set(
      callId,
      socket
    );

    console.log(
      `✅ Media Connected ${callId}`
    );

  }

  remove(
    callId: string
  ) {

    this.sockets.delete(callId);

    console.log(
      `❌ Media Closed ${callId}`
    );

  }

  get(
    callId: string
  ) {

    return this.sockets.get(callId);

  }

}

export const twilioMediaService =
  new TwilioMediaService();