import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  TaskSession,
  SessionStatus,
  ChatMessage,
  ActionResult,
} from "./types";

const DEFAULT_MAX_ITERATIONS = 25;

/**
 * Manages active task sessions and their conversation context.
 *
 * Each session tracks:
 *   - The user's goal
 *   - Full conversation history (system + user + assistant messages)
 *   - Action results with screenshots
 *   - Iteration count and limits
 *
 * Emits events: `session:created`, `session:updated`, `session:completed`,
 *               `session:failed`, `session:killed`.
 */
export class SessionManager extends EventEmitter {
  private sessions = new Map<string, TaskSession>();
  private defaultMaxIterations: number;

  constructor(maxIterations = DEFAULT_MAX_ITERATIONS) {
    super();
    this.defaultMaxIterations = maxIterations;
  }

  /** Create a new task session for the given goal. */
  create(goal: string, metadata: Record<string, unknown> = {}): TaskSession {
    const now = Date.now();
    const session: TaskSession = {
      id: randomUUID(),
      status: "idle",
      goal,
      conversationHistory: [],
      actionHistory: [],
      createdAt: now,
      updatedAt: now,
      iterationCount: 0,
      maxIterations: this.defaultMaxIterations,
      metadata,
    };

    this.sessions.set(session.id, session);
    this.emit("session:created", session);
    return session;
  }

  /** Look up a session by ID. */
  get(sessionId: string): TaskSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** List all sessions. */
  list(): TaskSession[] {
    return [...this.sessions.values()];
  }

  /** List sessions filtered by status. */
  listByStatus(status: SessionStatus): TaskSession[] {
    return this.list().filter((s) => s.status === status);
  }

  /** Transition a session to a new status. */
  setStatus(sessionId: string, status: SessionStatus): void {
    const session = this.requireSession(sessionId);
    session.status = status;
    session.updatedAt = Date.now();
    this.emit("session:updated", session);

    if (status === "completed") this.emit("session:completed", session);
    if (status === "failed") this.emit("session:failed", session);
    if (status === "killed") this.emit("session:killed", session);
  }

  /** Append a message to the conversation history. */
  addMessage(sessionId: string, message: ChatMessage): void {
    const session = this.requireSession(sessionId);
    session.conversationHistory.push(message);
    session.updatedAt = Date.now();
  }

  /** Append an action result. */
  addActionResult(sessionId: string, result: ActionResult): void {
    const session = this.requireSession(sessionId);
    session.actionHistory.push(result);
    session.updatedAt = Date.now();
  }

  /** Increment the iteration counter. Returns the new count. */
  incrementIteration(sessionId: string): number {
    const session = this.requireSession(sessionId);
    session.iterationCount++;
    session.updatedAt = Date.now();
    return session.iterationCount;
  }

  /** Check whether the session has exceeded its iteration limit. */
  hasExceededLimit(sessionId: string): boolean {
    const session = this.requireSession(sessionId);
    return session.iterationCount >= session.maxIterations;
  }

  /** Build the LLM context for a session (system prompt + history). */
  buildContext(sessionId: string): ChatMessage[] {
    const session = this.requireSession(sessionId);

    const systemPrompt: ChatMessage = {
      role: "system",
      content: [
        "You are monkeybot, a computer-use agent. The user has asked you to perform a task on their computer.",
        `Goal: ${session.goal}`,
        "",
        "You must respond with a JSON object matching the ActionPlan schema:",
        '  { "goal": string, "reasoning": string, "actions": PlannedAction[], "requiresScreenshot": boolean }',
        "",
        "PlannedAction:",
        '  { "type": "click"|"type"|"scroll"|"keypress"|"screenshot"|"wait",',
        '    "x"?: number, "y"?: number, "text"?: string, "key"?: string,',
        '    "duration"?: number, "description": string, "targetApp"?: string }',
        "",
        "Respond ONLY with the JSON object — no markdown, no explanation.",
      ].join("\n"),
    };

    // Summarise recent action results so the LLM knows what happened.
    const recentResults = session.actionHistory.slice(-10);
    const actionSummary =
      recentResults.length > 0
        ? {
            role: "system" as const,
            content:
              "Recent action results:\n" +
              recentResults
                .map(
                  (r) =>
                    `- ${r.action.description}: ${r.driverResponse.success ? "OK" : `FAIL: ${r.driverResponse.error ?? "unknown"}`}`
                )
                .join("\n"),
          }
        : null;

    const context: ChatMessage[] = [systemPrompt];
    if (actionSummary) context.push(actionSummary);
    context.push(...session.conversationHistory);
    return context;
  }

  /** Remove a session. */
  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private requireSession(sessionId: string): TaskSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    return session;
  }
}
