export class VoiceError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "VoiceError";
    this.code = code;
  }
}

export class ApiKeyMissingError extends VoiceError {
  constructor(service: string) {
    super(
      `${service} API key is required but was not provided. ` +
        `Pass it via VoiceConfig when creating a VoiceSession.`,
      "API_KEY_MISSING",
    );
    this.name = "ApiKeyMissingError";
  }
}

export class ApiKeyInvalidError extends VoiceError {
  constructor(service: string) {
    super(
      `${service} API key is invalid or expired. Please check your API key.`,
      "API_KEY_INVALID",
    );
    this.name = "ApiKeyInvalidError";
  }
}

export class RecordingError extends VoiceError {
  constructor(message: string) {
    super(message, "RECORDING_ERROR");
    this.name = "RecordingError";
  }
}

export class TranscriptionError extends VoiceError {
  constructor(message: string) {
    super(message, "TRANSCRIPTION_ERROR");
    this.name = "TranscriptionError";
  }
}

export class SynthesisError extends VoiceError {
  constructor(message: string) {
    super(message, "SYNTHESIS_ERROR");
    this.name = "SynthesisError";
  }
}

export class PlaybackError extends VoiceError {
  constructor(message: string) {
    super(message, "PLAYBACK_ERROR");
    this.name = "PlaybackError";
  }
}
