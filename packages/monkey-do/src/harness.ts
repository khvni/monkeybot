import type { AgentAction, AgentGoal, ExecutionResult } from "./types";

/**
 * Core agent harness — orchestrates goal execution by dispatching actions
 * to the CUA driver and collecting results.
 *
 * Stub — actual CUA interaction goes through the orchestrator → Rust driver.
 */
export class AgentHarness {
  private currentGoal: AgentGoal | null = null;

  async executeAction(action: AgentAction): Promise<ExecutionResult> {
    // TODO: Send action to CUA driver via orchestrator.
    console.log(`[AgentHarness] Executing action: ${action.type} (stub)`);
    return {
      success: true,
      action,
      timestamp: Date.now(),
    };
  }

  async setGoal(goal: AgentGoal): Promise<void> {
    this.currentGoal = { ...goal, status: "running" };
    console.log(`[AgentHarness] Goal set: ${goal.description}`);
  }

  async completeGoal(): Promise<void> {
    if (this.currentGoal) {
      this.currentGoal.status = "completed";
      console.log(
        `[AgentHarness] Goal completed: ${this.currentGoal.description}`
      );
      this.currentGoal = null;
    }
  }

  getGoal(): AgentGoal | null {
    return this.currentGoal;
  }
}
