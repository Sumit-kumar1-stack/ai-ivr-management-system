import { AppEvent } from "./event-types";

export interface EventRecord {

  id: string;

  event: AppEvent;

  payload: unknown;

  timestamp: Date;

}

export class EventMonitor {

  private static events: EventRecord[] = [];

  private static readonly MAX_EVENTS = 500;

  static add(
    event: AppEvent,
    payload: unknown
  ) {

    this.events.unshift({

      id: crypto.randomUUID(),

      event,

      payload,

      timestamp: new Date(),

    });

    if (
      this.events.length >
      this.MAX_EVENTS
    ) {

      this.events.pop();

    }

  }

  static getAll() {

    return this.events;

  }

  static clear() {

    this.events = [];

  }

}