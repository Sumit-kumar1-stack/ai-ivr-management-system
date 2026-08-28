class ConversationAbortService {

  private controllers =
    new Map<string, AbortController>();

  //----------------------------------

  create(callId: string) {

    const controller =
      new AbortController();

    this.controllers.set(
      callId,
      controller
    );

    return controller;

  }

  //----------------------------------

  signal(callId: string) {

    return this.controllers
      .get(callId)
      ?.signal;

  }

  //----------------------------------

  abort(callId: string) {

    this.controllers
      .get(callId)
      ?.abort();

  }

  //----------------------------------

  clear(callId: string) {

    this.controllers.delete(callId);

  }

}

export const ConversationAbort =
  new ConversationAbortService();