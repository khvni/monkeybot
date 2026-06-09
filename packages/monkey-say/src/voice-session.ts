import { AssemblyAITranscriber } from "./assemblyai";
import { ElevenLabsSynthesizer } from "./elevenlabs";
import type { VoiceConfig, TranscriptResult } from "./types";

/**
 * High-level voice session: manages STT + TTS lifecycle together.
 * Used by the Electron app's push-to-talk feature.
 */
export class VoiceSession {
  private transcriber: AssemblyAITranscriber;
  private synthesizer: ElevenLabsSynthesizer;
  private recording = false;

  constructor(config: VoiceConfig) {
    this.transcriber = new AssemblyAITranscriber(config.assemblyAiApiKey);
    this.synthesizer = new ElevenLabsSynthesizer(
      config.elevenLabsApiKey,
      config.elevenLabsVoiceId
    );
  }

  onTranscript(cb: (result: TranscriptResult) => void): void {
    this.transcriber.onTranscript(cb);
  }

  /** Start listening (push-to-talk begin). */
  async startListening(): Promise<void> {
    this.recording = true;
    await this.transcriber.start();
  }

  /** Stop listening (push-to-talk release). */
  async stopListening(): Promise<void> {
    this.recording = false;
    await this.transcriber.stop();
  }

  /** Speak a response via TTS. */
  async speak(text: string): Promise<ArrayBuffer> {
    return this.synthesizer.synthesize(text);
  }

  get isRecording(): boolean {
    return this.recording;
  }
}
