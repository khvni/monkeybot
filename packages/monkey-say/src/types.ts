export interface VoiceConfig {
  assemblyAiApiKey: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId?: string;
}

export interface TranscriptResult {
  text: string;
  confidence: number;
  isFinal: boolean;
  timestamp: number;
}

export interface SynthesisOptions {
  voiceId?: string;
  model?: string;
  stability?: number;
  similarityBoost?: number;
}
