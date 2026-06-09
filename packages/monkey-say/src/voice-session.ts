import { MicrophoneRecorder } from "./recorder";
import { AssemblyAITranscriber } from "./assemblyai";
import { ElevenLabsSynthesizer } from "./elevenlabs";
import { AudioPlayer } from "./audio-player";
import { ApiKeyMissingError, RecordingError } from "./errors";
import type {
  VoiceConfig,
  TranscriptResult,
  SynthesisOptions,
} from "./types";

/**
 * High-level voice session: manages push-to-talk recording, STT, TTS, and
 * audio playback as a single cohesive unit.
 *
 * Designed to be called from Electron IPC handlers:
 * - `startRecording()` — begin capturing microphone audio
 * - `stopRecording()`  — stop capture, transcribe via AssemblyAI, return text
 * - `speak(text)`      — synthesise via ElevenLabs, queue and play audio
 */
export class VoiceSession {
  private readonly config: VoiceConfig;
  private readonly recorder: MicrophoneRecorder;
  private readonly player: AudioPlayer;
  private transcriber: AssemblyAITranscriber | null = null;
  private synthesizer: ElevenLabsSynthesizer | null = null;
  private transcriptListeners: Array<(result: TranscriptResult) => void> = [];

  constructor(config: VoiceConfig) {
    this.config = config;
    this.recorder = new MicrophoneRecorder();
    this.player = new AudioPlayer();

    if (config.assemblyAiApiKey) {
      this.transcriber = new AssemblyAITranscriber(config.assemblyAiApiKey);
      this.transcriber.onTranscript((result) => {
        for (const cb of this.transcriptListeners) {
          cb(result);
        }
      });
    }

    if (config.elevenLabsApiKey) {
      this.synthesizer = new ElevenLabsSynthesizer(
        config.elevenLabsApiKey,
        config.elevenLabsVoiceId,
      );
    }
  }

  /** Register a listener invoked when a transcript is finalised. */
  onTranscript(cb: (result: TranscriptResult) => void): void {
    this.transcriptListeners.push(cb);
  }

  /** Begin capturing audio from the default microphone. */
  async startRecording(): Promise<void> {
    if (!this.config.assemblyAiApiKey) {
      throw new ApiKeyMissingError("AssemblyAI");
    }
    if (this.recorder.isRecording) {
      throw new RecordingError("Recording is already in progress.");
    }
    this.recorder.start();
  }

  /** Stop recording and return the transcribed text. */
  async stopRecording(): Promise<string> {
    if (!this.recorder.isRecording) {
      throw new RecordingError("No recording in progress.");
    }
    if (!this.transcriber) {
      throw new ApiKeyMissingError("AssemblyAI");
    }

    const audioBuffer = await this.recorder.stop();
    const result = await this.transcriber.transcribe(audioBuffer);
    return result.text;
  }

  /** Synthesise text to speech and play back through the audio queue. */
  async speak(text: string, options?: SynthesisOptions): Promise<void> {
    if (!this.synthesizer) {
      throw new ApiKeyMissingError("ElevenLabs");
    }

    const audio = await this.synthesizer.synthesize(text, options);
    await this.player.enqueue(audio, "mp3");
  }

  /** Immediately stop audio playback and clear the queue. */
  stopPlayback(): void {
    this.player.stop();
  }

  get isRecording(): boolean {
    return this.recorder.isRecording;
  }

  get isPlaying(): boolean {
    return this.player.isPlaying;
  }

  /** Release all resources held by the session. */
  destroy(): void {
    if (this.recorder.isRecording) {
      this.recorder.abort();
    }
    this.player.stop();
    this.transcriptListeners = [];
  }
}
