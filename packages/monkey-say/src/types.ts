export interface VoiceConfig {
  assemblyAiApiKey?: string;
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
}

export interface TranscriptResult {
  text: string;
  confidence: number;
  isFinal: boolean;
  timestamp: number;
  words?: WordTimestamp[];
  durationMs?: number;
}

export interface WordTimestamp {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface SynthesisOptions {
  voiceId?: string;
  model?: string;
  stability?: number;
  similarityBoost?: number;
  outputFormat?: string;
}

export interface RecorderConfig {
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
}
