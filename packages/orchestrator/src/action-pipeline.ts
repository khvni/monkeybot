import type { DriverClient } from "./driver-client";
import type { ModelRouter } from "./model-router";
import type { SafetyGate } from "./safety-gate";
import type { SessionManager } from "./session-manager";
import type {
  ActionPlan,
  ActionResult,
  PlannedAction,
  PipelineResult,
  ChatMessage,
} from "./types";
import { withRetry } from "./retry";

const MAX_ACTION_RETRIES = 2;

/**
 * Core action-planning pipeline.
 *
 * Flow:
 *   1. Receive user input (text or voice transcript).
 *   2. Build LLM context from the session's conversation history.
 *   3. Call the LLM (via ModelRouter) to produce an ActionPlan.
 *   4. For each planned action:
 *      a. Run safety checks (kill switch, allowlist, confirmation).
 *      b. Send the action to the Rust CUA driver.
 *      c. Optionally take a screenshot and feed it back.
 *   5. If the plan requests a follow-up screenshot, capture one and loop back
 *      to step 2 for the next iteration.
 *   6. Return the aggregated PipelineResult.
 */
export class ActionPipeline {
  private driver: DriverClient;
  private router: ModelRouter;
  private safety: SafetyGate;
  private sessions: SessionManager;

  constructor(
    driver: DriverClient,
    router: ModelRouter,
    safety: SafetyGate,
    sessions: SessionManager
  ) {
    this.driver = driver;
    this.router = router;
    this.safety = safety;
    this.sessions = sessions;
  }

  /**
   * Execute one full planning-execution cycle for a session.
   * Returns when the plan signals completion or the iteration limit is reached.
   */
  async run(sessionId: string, userInput: string): Promise<PipelineResult> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    // Append user message to context.
    this.sessions.addMessage(sessionId, {
      role: "user",
      content: userInput,
    });

    this.sessions.setStatus(sessionId, "planning");

    const allResults: ActionResult[] = [];
    let lastPlan: ActionPlan | undefined;
    let iterationError: string | undefined;

    // Iterative plan → execute → observe loop.
    while (!this.sessions.hasExceededLimit(sessionId)) {
      if (this.safety.isKilled) {
        this.sessions.setStatus(sessionId, "killed");
        return this.buildResult(sessionId, lastPlan, allResults, false, "Kill switch activated");
      }

      this.sessions.incrementIteration(sessionId);

      // ---- Plan ----
      let plan: ActionPlan;
      try {
        plan = await this.requestPlan(sessionId);
        lastPlan = plan;
      } catch (err) {
        iterationError = err instanceof Error ? err.message : String(err);
        break;
      }

      // Record assistant response.
      this.sessions.addMessage(sessionId, {
        role: "assistant",
        content: JSON.stringify(plan),
      });

      if (plan.actions.length === 0) {
        // No further actions — the LLM considers the task complete.
        break;
      }

      // ---- Execute ----
      this.sessions.setStatus(sessionId, "executing");

      for (const action of plan.actions) {
        if (this.safety.isKilled) {
          this.sessions.setStatus(sessionId, "killed");
          return this.buildResult(sessionId, plan, allResults, false, "Kill switch activated");
        }

        const result = await this.executeAction(sessionId, action);
        allResults.push(result);

        if (!result.driverResponse.success) {
          // Feed the error back to the LLM so it can adjust.
          this.sessions.addMessage(sessionId, {
            role: "user",
            content: `Action "${action.description}" failed: ${result.driverResponse.error ?? "unknown error"}`,
          });
        }
      }

      // ---- Observe ----
      if (plan.requiresScreenshot) {
        try {
          const screenshotResp = await this.driver.screenshot();
          if (screenshotResp.success) {
            this.sessions.addMessage(sessionId, {
              role: "user",
              content: "[screenshot captured after actions]",
            });
          }
        } catch {
          // Non-fatal — continue without screenshot feedback.
        }
      }

      // If the plan had no `requiresScreenshot`, we consider this cycle done.
      if (!plan.requiresScreenshot) break;
    }

    if (this.sessions.hasExceededLimit(sessionId)) {
      iterationError = iterationError ?? "Iteration limit reached";
    }

    const success = !iterationError;
    this.sessions.setStatus(sessionId, success ? "completed" : "failed");

    return this.buildResult(sessionId, lastPlan, allResults, success, iterationError);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /** Ask the LLM to produce an ActionPlan. */
  private async requestPlan(sessionId: string): Promise<ActionPlan> {
    const context: ChatMessage[] = this.sessions.buildContext(sessionId);
    const session = this.sessions.get(sessionId);
    const taskType = this.router.classifyTask(session?.goal ?? "");

    const response = await this.router.completeWithFallback(
      { messages: context },
      taskType
    );

    return this.parsePlan(response.content);
  }

  /** Parse the LLM response into a structured ActionPlan. */
  private parsePlan(raw: string): ActionPlan {
    // The LLM may wrap the JSON in markdown code fences — strip them.
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as ActionPlan;

      if (!parsed.goal || !Array.isArray(parsed.actions)) {
        throw new Error("Missing required fields in ActionPlan");
      }

      return parsed;
    } catch (err) {
      throw new Error(
        `Failed to parse ActionPlan from LLM response: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** Execute a single action through safety checks and the driver. */
  private async executeAction(
    sessionId: string,
    action: PlannedAction
  ): Promise<ActionResult> {
    // Safety check
    const safetyResult = await this.safety.check(action);
    if (!safetyResult.allowed) {
      return {
        action,
        driverResponse: {
          id: "",
          success: false,
          error: `Safety: ${safetyResult.reason}`,
        },
        timestamp: Date.now(),
      };
    }

    // Build the payload matching the Rust CuaAction struct.
    const payload: Record<string, unknown> = { type: action.type };
    if (action.x !== undefined) payload.x = action.x;
    if (action.y !== undefined) payload.y = action.y;
    if (action.text !== undefined) payload.text = action.text;
    if (action.key !== undefined) payload.key = action.key;
    if (action.duration !== undefined) payload.duration = action.duration;

    // Execute with retry.
    try {
      const driverResponse = await withRetry(
        () => this.driver.executeAction(payload),
        {
          maxAttempts: MAX_ACTION_RETRIES,
          baseDelay: 500,
          maxDelay: 3000,
          backoffFactor: 2,
        }
      );

      const result: ActionResult = {
        action,
        driverResponse,
        timestamp: Date.now(),
      };

      this.sessions.addActionResult(sessionId, result);
      return result;
    } catch (err) {
      const result: ActionResult = {
        action,
        driverResponse: {
          id: "",
          success: false,
          error: err instanceof Error ? err.message : String(err),
        },
        timestamp: Date.now(),
      };

      this.sessions.addActionResult(sessionId, result);
      return result;
    }
  }

  private buildResult(
    sessionId: string,
    plan: ActionPlan | undefined,
    results: ActionResult[],
    success: boolean,
    error?: string
  ): PipelineResult {
    const session = this.sessions.get(sessionId);
    return {
      sessionId,
      plan: plan ?? { goal: "", reasoning: "", actions: [], requiresScreenshot: false },
      results,
      success,
      iterationCount: session?.iterationCount ?? 0,
      error,
    };
  }
}
