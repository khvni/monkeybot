/**
 * @monkeybot/monkey-see
 *
 * Recording engine: screen capture, cursor tracking, click events, and
 * keystroke capture. Outputs structured action data from user demonstrations.
 */

export interface RecordingEvent {
  /** Unix-ms timestamp of the event. */
  timestamp: number;
  type: "click" | "keypress" | "scroll" | "cursor_move" | "screenshot";
}

export interface ClickEvent extends RecordingEvent {
  type: "click";
  x: number;
  y: number;
  button: "left" | "right" | "middle";
}

export interface KeypressEvent extends RecordingEvent {
  type: "keypress";
  key: string;
  modifiers: string[];
}

export interface CursorMoveEvent extends RecordingEvent {
  type: "cursor_move";
  x: number;
  y: number;
}

export interface ScreenshotEvent extends RecordingEvent {
  type: "screenshot";
  /** Base-64 encoded image data or file path. */
  data: string;
}

export type CapturedEvent =
  | ClickEvent
  | KeypressEvent
  | CursorMoveEvent
  | ScreenshotEvent;

export interface Recording {
  id: string;
  startedAt: number;
  events: CapturedEvent[];
}
