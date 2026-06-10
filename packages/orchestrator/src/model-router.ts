import type {
  ModelRequest,
  ModelResponse,
  ModelConfig,
  TaskType,
} from "./types";
import { withRetry, type RetryOptions } from "./retry";

/** Shape of the OpenRouter chat-completion response. */
interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Model routing via OpenRouter.
 *
 * Strategy:
 *   - Gemini 1.5 Flash for repetitive/high-volume inference cycles
 *   - Claude 3.5 Sonnet for complex reasoning and planning
 *   - GPT-4o as a general-purpose fallback
 *
 * Includes:
 *   - Real HTTP calls to the OpenRouter API
 *   - Automatic fallback: fast → reasoning → fallback
 *   - Retry with exponential back-off on transient errors
 *   - Task-type classification heuristic
 */
export class ModelRouter {
  private apiKey: string;
  private endpoint = "https://openrouter.ai/api/v1/chat/completions";
  private retryOptions: RetryOptions;

  /** Pre-configured model profiles. */
  static readonly MODELS: Record<string, ModelConfig> = {
    fast: {
      id: "fast",
      provider: "openrouter",
      model: "google/gemini-flash-1.5",
      maxTokens: 4096,
      temperature: 0.3,
    },
    reasoning: {
      id: "reasoning",
      provider: "openrouter",
      model: "anthropic/claude-3.5-sonnet",
      maxTokens: 8192,
      temperature: 0.5,
    },
    fallback: {
      id: "fallback",
      provider: "openrouter",
      model: "openai/gpt-4o",
      maxTokens: 4096,
      temperature: 0.5,
    },
  };

  /** Ordered fallback chain: try each model in order. */
  private static readonly FALLBACK_CHAIN: string[] = [
    "fast",
    "reasoning",
    "fallback",
  ];

  constructor(apiKey: string, retryOptions?: Partial<RetryOptions>) {
    this.apiKey = apiKey;
    this.retryOptions = {
      maxAttempts: retryOptions?.maxAttempts ?? 3,
      baseDelay: retryOptions?.baseDelay ?? 1000,
      maxDelay: retryOptions?.maxDelay ?? 15_000,
      backoffFactor: retryOptions?.backoffFactor ?? 2,
      retryableErrors: retryOptions?.retryableErrors ?? [
        "ECONNRESET",
        "ETIMEDOUT",
        "429",
        "500",
        "502",
        "503",
      ],
    };
  }

  /**
   * Classify a user prompt into a task type for model selection.
   *
   * Heuristic:
   *   - Short prompts (≤ 60 chars) with no question marks → repetitive
   *   - Prompts containing reasoning keywords → reasoning
   *   - Everything else → general
   */
  classifyTask(prompt: string): TaskType {
    const lower = prompt.toLowerCase();
    const reasoningKeywords = [
      "why",
      "explain",
      "reason",
      "plan",
      "think",
      "analyze",
      "compare",
      "evaluate",
      "strategy",
      "decide",
      "complex",
      "debug",
      "investigate",
    ];

    if (reasoningKeywords.some((kw) => lower.includes(kw))) {
      return "reasoning";
    }

    if (prompt.length <= 60 && !prompt.includes("?")) {
      return "repetitive";
    }

    return "general";
  }

  /** Select the best model config for the given task type. */
  selectModel(taskType: TaskType = "general"): ModelConfig {
    switch (taskType) {
      case "repetitive":
        return ModelRouter.MODELS.fast;
      case "reasoning":
        return ModelRouter.MODELS.reasoning;
      default:
        return ModelRouter.MODELS.fallback;
    }
  }

  /** Send a chat completion request via OpenRouter. */
  async complete(
    request: ModelRequest,
    taskType: TaskType = "general"
  ): Promise<ModelResponse> {
    const config = this.selectModel(taskType);
    const model = request.model ?? config.model;

    return withRetry(() => this.callOpenRouter(request, model, config), {
      ...this.retryOptions,
    });
  }

  /**
   * Send a request with automatic model fallback.
   * Tries the primary model first, then walks the fallback chain.
   */
  async completeWithFallback(
    request: ModelRequest,
    taskType: TaskType = "general"
  ): Promise<ModelResponse> {
    const primaryConfig = this.selectModel(taskType);
    const primaryModel = request.model ?? primaryConfig.model;

    try {
      return await withRetry(
        () => this.callOpenRouter(request, primaryModel, primaryConfig),
        this.retryOptions
      );
    } catch {
      // Walk the fallback chain, skipping the model we already tried.
      for (const profileId of ModelRouter.FALLBACK_CHAIN) {
        const fallbackConfig = ModelRouter.MODELS[profileId];
        if (fallbackConfig.model === primaryModel) continue;

        try {
          return await this.callOpenRouter(
            request,
            fallbackConfig.model,
            fallbackConfig
          );
        } catch {
          continue;
        }
      }
    }

    throw new Error("All models in the fallback chain failed");
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private async callOpenRouter(
    request: ModelRequest,
    model: string,
    config: ModelConfig
  ): Promise<ModelResponse> {
    const body = {
      model,
      messages: request.messages,
      max_tokens: request.maxTokens ?? config.maxTokens,
      temperature: request.temperature ?? config.temperature,
    };

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/khvni/monkeybot",
        "X-Title": "monkeybot",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `OpenRouter ${res.status}: ${text || res.statusText}`
      );
    }

    const data = (await res.json()) as OpenRouterResponse;
    const choice = data.choices[0];

    if (!choice) {
      throw new Error("OpenRouter returned no choices");
    }

    return {
      content: choice.message.content,
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      finishReason: choice.finish_reason,
    };
  }
}
