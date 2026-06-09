import type { CapturedEvent } from "./types";

export type EventCallback = (event: CapturedEvent) => void;

/**
 * Captures OS-level input events (clicks, keystrokes, mouse movement, scrolls).
 * In production, hooks into platform-specific APIs (CGEventTap on macOS,
 * XInput on Linux, etc.) via the Rust CUA driver IPC.
 * Exposes a programmatic inject() method for feeding events from native hooks.
 */
export class EventCapture {
  private listeners: EventCallback[] = [];
  private active = false;
  private buffer: CapturedEvent[] = [];

  onEvent(cb: EventCallback): void {
    this.listeners.push(cb);
  }

  removeListener(cb: EventCallback): void {
    this.listeners = this.listeners.filter((l) => l !== cb);
  }

  start(): void {
    this.active = true;
    this.buffer = [];
  }

  stop(): CapturedEvent[] {
    this.active = false;
    const events = [...this.buffer];
    this.buffer = [];
    return events;
  }

  isActive(): boolean {
    return this.active;
  }

  getBufferedEvents(): CapturedEvent[] {
    return [...this.buffer];
  }

  /**
   * Inject an event from native hooks (Rust CUA driver IPC).
   * Events are buffered and emitted to listeners.
   */
  inject(event: CapturedEvent): void {
    if (!this.active) return;
    this.buffer.push(event);
    this.emit(event);
  }

  /**
   * Inject a click event with convenience parameters.
   */
  injectClick(x: number, y: number, button: "left" | "right" | "middle" = "left"): void {
    this.inject({
      type: "click",
      timestamp: Date.now(),
      x,
      y,
      button,
    });
  }

  /**
   * Inject a keystroke event.
   */
  injectKeystroke(key: string, eventType: "keydown" | "keyup" = "keydown"): void {
    this.inject({
      type: eventType,
      timestamp: Date.now(),
      key,
    });
  }

  /**
   * Inject a scroll event.
   */
  injectScroll(x: number, y: number, dx: number, dy: number): void {
    this.inject({
      type: "scroll",
      timestamp: Date.now(),
      x,
      y,
      scrollDelta: { dx, dy },
    });
  }

  /**
   * Inject a mouse move event.
   */
  injectMouseMove(x: number, y: number): void {
    this.inject({
      type: "mouse_move",
      timestamp: Date.now(),
      x,
      y,
    });
  }

  private emit(event: CapturedEvent): void {
    for (const cb of this.listeners) {
      cb(event);
    }
  }
}
