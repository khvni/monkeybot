import type { AgentAction, ExecutionResult } from "./types";
import { AgentHarness } from "./harness";

/**
 * Replays a learned skill (sequence of actions) with optional adaptation.
 * Stub — full implementation will use vision-augmented validation.
 */
export class SkillExecutor {
  private harness: AgentHarness;

  constructor(harness: AgentHarness) {
    this.harness = harness;
  }

  /**
   * Replay a recorded trajectory as a skill.
   * Each action is dispatched sequentially through the harness.
   */
  async replay(actions: AgentAction[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    for (const action of actions) {
      const result = await this.harness.executeAction(action);
      results.push(result);
      if (!result.success) {
        console.warn(`[SkillExecutor] Action failed: ${action.type}`);
        break;
      }
    }
    return results;
  }
}
