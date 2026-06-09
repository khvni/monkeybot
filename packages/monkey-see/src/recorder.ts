import type { RecordingSession, ScreenFrame } from "./types";

/**
 * Captures screen frames during a user demonstration.
 * Stub — platform-specific implementation required (e.g. native screen capture APIs).
 */
export class ScreenRecorder {
  private session: RecordingSession | null = null;

  start(sessionId: string): void {
    this.session = {
      id: sessionId,
      startedAt: Date.now(),
      events: [],
      frames: [],
    };
    // TODO: Hook into native screen capture (platform-specific).
  }

  captureFrame(): ScreenFrame | null {
    if (!this.session) return null;
    // TODO: Capture actual screen frame via native API.
    return {
      timestamp: Date.now(),
      data: "",
      width: 0,
      height: 0,
    };
  }

  stop(): RecordingSession | null {
    if (!this.session) return null;
    this.session.endedAt = Date.now();
    const session = this.session;
    this.session = null;
    return session;
  }
}
