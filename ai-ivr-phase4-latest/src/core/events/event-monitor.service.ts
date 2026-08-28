import {
  randomUUID,
} from "node:crypto";

import {
  AppEvent,
} from "./event-types";

import {
  createSafeEventSnapshot,
  SafeEventSnapshot,
} from "./event-snapshot";

export interface EventRecord {
  id:
    string;

  event:
    AppEvent;

  /**
   * Contains only safe payload metadata.
   * It never stores raw transcript or AI text.
   */
  payload:
    SafeEventSnapshot;

  timestamp:
    Date;
}

export class EventMonitor {
  private static events:
    EventRecord[] =
    [];

  private static readonly MAX_EVENTS =
    500;

  static add(
    event: AppEvent,
    payload: unknown
  ): void {
    this.events.unshift({
      id:
        randomUUID(),

      event,

      payload:
        createSafeEventSnapshot(
          payload
        ),

      timestamp:
        new Date(),
    });

    if (
      this.events.length >
      this.MAX_EVENTS
    ) {
      this.events.pop();
    }
  }

  static getAll():
    EventRecord[] {
    /*
     * Return a copy so external consumers cannot
     * mutate the monitor's internal collection.
     */
    return [
      ...this.events,
    ];
  }

  static clear():
    void {
    this.events =
      [];
  }
}