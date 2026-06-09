/**
 * @monkeybot/monkey-say
 *
 * Realtime voice interaction layer. Handles speech-to-text, intent parsing,
 * and voice-based teaching / direction for the agent.
 */

export interface VoiceIntent {
  /** Raw transcript from the speech-to-text engine. */
  transcript: string;
  /** Parsed intent label (e.g. "teach", "command", "feedback"). */
  intent: string;
  /** Confidence score 0-1. */
  confidence: number;
}

export interface VoiceSession {
  id: string;
  startedAt: number;
  /** Whether the microphone is actively capturing. */
  active: boolean;
}
