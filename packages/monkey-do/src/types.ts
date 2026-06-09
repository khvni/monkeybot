/** An atomic action the agent can take on the computer. */
export interface AgentAction {
  type: "click" | "type" | "scroll" | "keypress" | "screenshot" | "wait";
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  duration?: number;
  meta?: Record<string, unknown>;
}

/** A high-level goal the agent is working toward. */
export interface AgentGoal {
  id: string;
  description: string;
  skillId?: string;
  status: "pending" | "running" | "completed" | "failed";
}

/** Result from executing an action or skill. */
export interface ExecutionResult {
  success: boolean;
  action: AgentAction;
  screenshot?: string;
  error?: string;
  timestamp: number;
}
