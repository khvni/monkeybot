import type { TranscriptResult } from "./types";
import { ApiKeyInvalidError, TranscriptionError } from "./errors";

const API_BASE = "https://api.assemblyai.com/v2";
const POLL_INTERVAL_MS = 1_000;
const MAX_POLL_ATTEMPTS = 120;

export type TranscriptCallback = (result: TranscriptResult) => void;

interface UploadResponse {
  upload_url: string;
}

interface TranscriptCreateResponse {
  id: string;
  status: string;
}

interface TranscriptPollResponse {
  id: string;
  status: string;
  text: string | null;
  confidence: number | null;
  audio_duration: number | null;
  words: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
  }> | null;
  error: string | null;
}

export class AssemblyAITranscriber {
  private readonly apiKey: string;
  private readonly listeners: TranscriptCallback[] = [];

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  onTranscript(cb: TranscriptCallback): void {
    this.listeners.push(cb);
  }

  async transcribe(audioBuffer: Buffer): Promise<TranscriptResult> {
    const uploadUrl = await this.upload(audioBuffer);
    const transcriptId = await this.createTranscript(uploadUrl);
    return this.pollTranscript(transcriptId);
  }

  private async upload(audioBuffer: Buffer): Promise<string> {
    const response = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      headers: {
        authorization: this.apiKey,
        "content-type": "application/octet-stream",
      },
      body: audioBuffer,
    });

    if (response.status === 401) {
      throw new ApiKeyInvalidError("AssemblyAI");
    }

    if (!response.ok) {
      const body = await response.text();
      throw new TranscriptionError(
        `Audio upload failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as UploadResponse;
    return data.upload_url;
  }

  private async createTranscript(audioUrl: string): Promise<string> {
    const response = await fetch(`${API_BASE}/transcript`, {
      method: "POST",
      headers: {
        authorization: this.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ audio_url: audioUrl }),
    });

    if (response.status === 401) {
      throw new ApiKeyInvalidError("AssemblyAI");
    }

    if (!response.ok) {
      const body = await response.text();
      throw new TranscriptionError(
        `Transcript creation failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as TranscriptCreateResponse;
    return data.id;
  }

  private async pollTranscript(id: string): Promise<TranscriptResult> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const response = await fetch(`${API_BASE}/transcript/${id}`, {
        headers: { authorization: this.apiKey },
      });

      if (!response.ok) {
        throw new TranscriptionError(
          `Transcript poll failed (${response.status})`,
        );
      }

      const data = (await response.json()) as TranscriptPollResponse;

      if (data.status === "completed") {
        const result: TranscriptResult = {
          text: data.text ?? "",
          confidence: data.confidence ?? 0,
          isFinal: true,
          timestamp: Date.now(),
          words: data.words?.map((w) => ({
            text: w.text,
            start: w.start,
            end: w.end,
            confidence: w.confidence,
          })),
          durationMs: data.audio_duration
            ? data.audio_duration * 1_000
            : undefined,
        };

        for (const cb of this.listeners) {
          cb(result);
        }

        return result;
      }

      if (data.status === "error") {
        throw new TranscriptionError(
          `Transcription failed: ${data.error ?? "Unknown error"}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new TranscriptionError(
      `Transcription timed out after ${MAX_POLL_ATTEMPTS} seconds.`,
    );
  }
}
