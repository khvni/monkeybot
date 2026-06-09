/** A single captured user event (click, keystroke, scroll, etc.). */
export interface CapturedEvent {
  type: "click" | "keydown" | "keyup" | "scroll" | "mouse_move";
  timestamp: number;
  x?: number;
  y?: number;
  key?: string;
  meta?: Record<string, unknown>;
}

/** A single frame captured from the screen. */
export interface ScreenFrame {
  timestamp: number;
  /** Base64-encoded image data or file path. */
  data: string;
  width: number;
  height: number;
}

/** Represents a full recording session. */
export interface RecordingSession {
  id: string;
  startedAt: number;
  endedAt?: number;
  events: CapturedEvent[];
  frames: ScreenFrame[];
}
