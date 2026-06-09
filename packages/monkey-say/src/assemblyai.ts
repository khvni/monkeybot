import type { TranscriptResult } from "./types";

export type TranscriptCallback = (result: TranscriptResult) => void;

/**
 * Real-time speech-to-text transcription via AssemblyAI.
 * Stub — requires AssemblyAI Streaming SDK integration.
 */
export class AssemblyAITranscriber {
  private apiKey: string;
  private listeners: TranscriptCallback[] = [];
  private active = false;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  onTranscript(cb: TranscriptCallback): void {
    this.listeners.push(cb);
  }

  async start(): Promise<void> {
    this.active = true;
    // TODO: Open WebSocket connection to AssemblyAI real-time endpoint.
    // TODO: Pipe microphone audio stream to the connection.
    console.log("[AssemblyAI] Transcriber started (stub)");
  }

  async stop(): Promise<void> {
    this.active = false;
    // TODO: Close WebSocket, flush pending transcripts.
    console.log("[AssemblyAI] Transcriber stopped (stub)");
  }

  /** @internal Emit a transcript to all registered listeners. */
  protected emit(result: TranscriptResult): void {
    if (!this.active) return;
    for (const cb of this.listeners) {
      cb(result);
    }
  }
}
