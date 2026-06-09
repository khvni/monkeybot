import type { ModelRequest, ModelResponse, ModelConfig } from "./types";

/**
 * Model routing via OpenRouter.
 *
 * Strategy:
 *   - Gemini 1.5 Flash for repetitive/high-volume inference cycles
 *   - Claude 3.5 Sonnet for complex reasoning and planning
 *   - GPT-4o as a fallback for diverse capability
 */
export class ModelRouter {
  private apiKey: string;
  private endpoint = "https://openrouter.ai/api/v1/chat/completions";

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

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Select the best model for the given task type.
   * Stub — real implementation would use heuristics or task classification.
   */
  selectModel(
    taskType: "repetitive" | "reasoning" | "general" = "general"
  ): ModelConfig {
    switch (taskType) {
      case "repetitive":
        return ModelRouter.MODELS.fast;
      case "reasoning":
        return ModelRouter.MODELS.reasoning;
      default:
        return ModelRouter.MODELS.fallback;
    }
  }

  /**
   * Send a chat completion request via OpenRouter.
   * Stub — returns a placeholder response.
   */
  async complete(
    request: ModelRequest,
    taskType: "repetitive" | "reasoning" | "general" = "general"
  ): Promise<ModelResponse> {
    const config = this.selectModel(taskType);
    const model = request.model ?? config.model;

    // TODO: Implement actual HTTP POST to OpenRouter.
    // const response = await fetch(this.endpoint, {
    //   method: "POST",
    //   headers: {
    //     Authorization: `Bearer ${this.apiKey}`,
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     model,
    //     messages: request.messages,
    //     max_tokens: request.maxTokens ?? config.maxTokens,
    //     temperature: request.temperature ?? config.temperature,
    //   }),
    // });

    console.log(`[ModelRouter] Would route to ${model} (stub)`);

    return {
      content: "",
      model,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "stop",
    };
  }
}
