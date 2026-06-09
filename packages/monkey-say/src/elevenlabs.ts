import type { SynthesisOptions } from "./types";

/**
 * Text-to-speech synthesis via ElevenLabs.
 * Stub — requires ElevenLabs API integration.
 */
export class ElevenLabsSynthesizer {
  private apiKey: string;
  private defaultVoiceId: string;

  constructor(apiKey: string, defaultVoiceId = "default") {
    this.apiKey = apiKey;
    this.defaultVoiceId = defaultVoiceId;
  }

  /**
   * Synthesize text to audio and return the audio buffer.
   * Stub — returns an empty buffer.
   */
  async synthesize(
    text: string,
    options?: SynthesisOptions
  ): Promise<ArrayBuffer> {
    const voiceId = options?.voiceId ?? this.defaultVoiceId;
    // TODO: POST to ElevenLabs text-to-speech API.
    // Endpoint: https://api.elevenlabs.io/v1/text-to-speech/{voiceId}
    console.log(
      `[ElevenLabs] Synthesizing "${text}" with voice ${voiceId} (stub)`
    );
    return new ArrayBuffer(0);
  }

  /**
   * Stream audio synthesis for lower latency.
   * Stub — returns an empty async iterable.
   */
  async *synthesizeStream(
    text: string,
    options?: SynthesisOptions
  ): AsyncIterable<Uint8Array> {
    const voiceId = options?.voiceId ?? this.defaultVoiceId;
    // TODO: Use ElevenLabs streaming endpoint.
    console.log(
      `[ElevenLabs] Streaming "${text}" with voice ${voiceId} (stub)`
    );
  }
}
