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

/** A single chat message for LLM context. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Request to a language model via OpenRouter. */
export interface ModelRequest {
  messages: ChatMessage[];
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

/** Task type for model routing. */
export type TaskType = "repetitive" | "reasoning" | "general";

// ---------------------------------------------------------------------------
// Action planning types
// ---------------------------------------------------------------------------

/** An atomic computer-use action planned by the LLM. */
export interface PlannedAction {
  type: "click" | "type" | "scroll" | "keypress" | "screenshot" | "wait";
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  duration?: number;
  description: string;
  targetApp?: string;
}

/** The structured plan the LLM returns for a user request. */
export interface ActionPlan {
  goal: string;
  reasoning: string;
  actions: PlannedAction[];
  requiresScreenshot: boolean;
}

/** Result of executing a single planned action through the driver. */
export interface ActionResult {
  action: PlannedAction;
  driverResponse: DriverResponse;
  screenshotData?: Record<string, unknown>;
  timestamp: number;
}

/** Marker left in ActionResult.screenshotData after pruning. */
export interface ScreenshotRef {
  pruned: true;
  originalSize: number;
}

/** Outcome of a full planning-execution cycle. */
export interface PipelineResult {
  sessionId: string;
  plan: ActionPlan;
  results: ActionResult[];
  success: boolean;
  iterationCount: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Session management types
// ---------------------------------------------------------------------------

/** Status of a task session. */
export type SessionStatus =
  | "idle"
  | "planning"
  | "executing"
  | "waiting_for_user"
  | "completed"
  | "failed"
  | "killed";

/** Represents an active task session with conversation context. */
export interface TaskSession {
  id: string;
  status: SessionStatus;
  goal: string;
  conversationHistory: ChatMessage[];
  actionHistory: ActionResult[];
  createdAt: number;
  updatedAt: number;
  iterationCount: number;
  maxIterations: number;
  metadata: Record<string, unknown>;
  /** True while an ActionPipeline loop is running for this session. */
  isProcessing: boolean;
}

// ---------------------------------------------------------------------------
// Driver client configuration
// ---------------------------------------------------------------------------

/** Options for connecting to the CUA driver. */
export interface DriverClientOptions {
  socketPath?: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  requestTimeout?: number;
}

// ---------------------------------------------------------------------------
// Retry configuration
// ---------------------------------------------------------------------------

/** Configuration for retry behaviour. */
export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrors?: string[];
}

// ---------------------------------------------------------------------------
// Safety gate types
// ---------------------------------------------------------------------------

/**
 * Async callback for resolving the foreground app for a planned action.
 * Return the app identifier or null if detection is unavailable.
 */
export type AppDetector = (action: PlannedAction) => Promise<string | null>;

/** Configuration for the safety gate. */
export interface SafetyGateConfig {
  allowedApps: string[];
  destructivePatterns: string[];
  maxActionsBeforeConfirm: number;
  /** Optional async app detector — runs off the main loop. */
  appDetector?: AppDetector;
}

/** Configuration for session manager. */
export interface SessionManagerConfig {
  maxIterations?: number;
  /** Max action-result entries kept per session (oldest are dropped). */
  maxActionHistory?: number;
  /** Number of most-recent action results that retain full screenshot data. */
  screenshotRetention?: number;
  /** Max conversation messages kept per session. */
  maxConversationHistory?: number;
}

/** Result of a safety check. */
export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation: boolean;
}

// ---------------------------------------------------------------------------
// Orchestrator top-level config
// ---------------------------------------------------------------------------

/** Full configuration for the orchestrator. */
export interface OrchestratorConfig {
  openRouterApiKey: string;
  driverSocketPath?: string;
  safety: SafetyGateConfig;
  maxIterationsPerSession?: number;
  requestTimeout?: number;
}
