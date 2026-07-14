import { EventEmitter } from "events";

export const ConversationEvents =
  new EventEmitter();

ConversationEvents.setMaxListeners(100);