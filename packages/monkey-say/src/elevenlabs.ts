import type { SynthesisOptions } from "./types";
import { ApiKeyInvalidError, SynthesisError } from "./errors";

const API_BASE = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL = "eleven_monolingual_v1";

export class ElevenLabsSynthesizer {
  private readonly apiKey: string;
  private readonly defaultVoiceId: string;

  constructor(apiKey: string, defaultVoiceId?: string) {
    this.apiKey = apiKey;
    this.defaultVoiceId = defaultVoiceId ?? DEFAULT_VOICE_ID;
  }

  async synthesize(
    text: string,
    options?: SynthesisOptions,
  ): Promise<Buffer> {
    const voiceId = options?.voiceId ?? this.defaultVoiceId;
    const model = options?.model ?? DEFAULT_MODEL;
    const outputFormat = options?.outputFormat ?? "mp3_44100_128";

    const url = `${API_BASE}/text-to-speech/${voiceId}?output_format=${outputFormat}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": this.apiKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: options?.stability ?? 0.5,
          similarity_boost: options?.similarityBoost ?? 0.75,
        },
      }),
    });

    if (response.status === 401) {
      throw new ApiKeyInvalidError("ElevenLabs");
    }

    if (!response.ok) {
      const body = await response.text();
      throw new SynthesisError(
        `Speech synthesis failed (${response.status}): ${body}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async *synthesizeStream(
    text: string,
    options?: SynthesisOptions,
  ): AsyncGenerator<Buffer> {
    const voiceId = options?.voiceId ?? this.defaultVoiceId;
    const model = options?.model ?? DEFAULT_MODEL;
    const outputFormat = options?.outputFormat ?? "mp3_44100_128";

    const url = `${API_BASE}/text-to-speech/${voiceId}/stream?output_format=${outputFormat}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": this.apiKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: options?.stability ?? 0.5,
          similarity_boost: options?.similarityBoost ?? 0.75,
        },
      }),
    });

    if (response.status === 401) {
      throw new ApiKeyInvalidError("ElevenLabs");
    }

    if (!response.ok) {
      const body = await response.text();
      throw new SynthesisError(
        `Streaming synthesis failed (${response.status}): ${body}`,
      );
    }

    if (!response.body) {
      throw new SynthesisError("No response body for streaming synthesis.");
    }

    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        yield Buffer.from(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
}
