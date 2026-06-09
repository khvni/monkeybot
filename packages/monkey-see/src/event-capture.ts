import type { CapturedEvent } from "./types";

export type EventCallback = (event: CapturedEvent) => void;

/**
 * Captures OS-level input events (clicks, keystrokes, mouse movement).
 * Stub — requires platform-specific accessibility/input hooks.
 */
export class EventCapture {
  private listeners: EventCallback[] = [];
  private active = false;

  onEvent(cb: EventCallback): void {
    this.listeners.push(cb);
  }

  start(): void {
    this.active = true;
    // TODO: Hook into OS-level input monitoring (accessibility API, CGEventTap, etc.).
  }

  stop(): void {
    this.active = false;
    // TODO: Unhook input monitoring.
  }

  /** Emit an event to all registered listeners (used internally). */
  protected emit(event: CapturedEvent): void {
    if (!this.active) return;
    for (const cb of this.listeners) {
      cb(event);
    }
  }
}
