/** Message sent to the Rust CUA driver over Unix socket. */
export interface DriverMessage {
  id: string;
  type: "execute_action" | "screenshot" | "kill" | "status";
  payload?: Record<string, unknown>;
}

/** Response from the Rust CUA driver. */
export interface DriverResponse {
  id: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

/** Configuration for a specific model. */
export interface ModelConfig {
  id: string;
  provider: "openrouter";
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/** Request to a language model via OpenRouter. */
export interface ModelRequest {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/** Response from a language model. */
export interface ModelResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}
