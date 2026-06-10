import { EventCapture, type EventCallback } from "./event-capture";
import type { RecordingSession, ScreenFrame, CapturedEvent, LearningPipelineConfig } from "./types";
import { randomUUID } from "node:crypto";

/**
 * Manages user-initiated recording sessions ("watch me" mode).
 * Captures screen frames and user input events, producing a RecordingSession
 * that can be fed into the learning pipeline.
 */
export class ScreenRecorder {
  private session: RecordingSession | null = null;
  private eventCapture: EventCapture;
  private frameTimer: ReturnType<typeof setInterval> | null = null;
  private config: LearningPipelineConfig;
  private frameCallback: (() => ScreenFrame | null) | null = null;
  private eventHandler: EventCallback | null = null;

  constructor(config: LearningPipelineConfig) {
    this.config = config;
    this.eventCapture = new EventCapture();
  }

  /**
   * Register a callback that provides screen frames.
   * In production, this connects to the Rust CUA driver's screen capture.
   */
  setFrameProvider(provider: () => ScreenFrame | null): void {
    this.frameCallback = provider;
  }

  /**
   * Get the underlying event capture for injecting events from native hooks.
   */
  getEventCapture(): EventCapture {
    return this.eventCapture;
  }

  /**
   * Start a new recording session ("watch me" mode).
   */
  start(workflowId: string, sessionId?: string): string {
    if (this.session) {
      throw new Error("Recording already in progress. Call stop() first.");
    }

    const id = sessionId ?? randomUUID();
    this.session = {
      id,
      workflowId,
      startedAt: Date.now(),
      events: [],
      frames: [],
    };

    // Wire up event capture to session
    this.eventHandler = (event: CapturedEvent) => {
      if (this.session) {
        this.session.events.push(event);
      }
    };
    this.eventCapture.onEvent(this.eventHandler);
    this.eventCapture.start();

    // Start periodic frame capture
    const intervalMs = this.config.frameIntervalMs ?? 1000;
    this.frameTimer = setInterval(() => {
      this.captureFrame();
    }, intervalMs);

    return id;
  }

  /**
   * Manually capture a frame (also called periodically during recording).
   */
  captureFrame(): ScreenFrame | null {
    if (!this.session) return null;

    let frame: ScreenFrame | null = null;
    if (this.frameCallback) {
      frame = this.frameCallback();
    }

    if (!frame) {
      // Placeholder frame — in production, the CUA driver provides real screenshots
      frame = {
        timestamp: Date.now(),
        data: "",
        width: 0,
        height: 0,
      };
    }

    this.session.frames.push(frame);
    return frame;
  }

  /**
   * Stop the current recording session and return the captured data.
   */
  stop(): RecordingSession | null {
    if (!this.session) return null;

    // Stop frame capture timer
    if (this.frameTimer) {
      clearInterval(this.frameTimer);
      this.frameTimer = null;
    }

    // Stop event capture and remove listener to prevent accumulation
    this.eventCapture.stop();
    if (this.eventHandler) {
      this.eventCapture.removeListener(this.eventHandler);
      this.eventHandler = null;
    }

    this.session.endedAt = Date.now();
    const session = this.session;
    this.session = null;
    return session;
  }

  /**
   * Check if a recording is currently active.
   */
  isRecording(): boolean {
    return this.session !== null;
  }

  /**
   * Get the current session ID if recording.
   */
  getSessionId(): string | null {
    return this.session?.id ?? null;
  }

  /**
   * Get the elapsed recording time in milliseconds.
   */
  getElapsedMs(): number {
    if (!this.session) return 0;
    return Date.now() - this.session.startedAt;
  }

  /**
   * Get current event count for the active session.
   */
  getEventCount(): number {
    return this.session?.events.length ?? 0;
  }

  /**
   * Get current frame count for the active session.
   */
  getFrameCount(): number {
    return this.session?.frames.length ?? 0;
  }
}
