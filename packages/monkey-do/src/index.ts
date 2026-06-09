/**
 * @monkeybot/monkey-do
 *
 * Action harness: computer-use agent with accessibility-based cursor control,
 * coding capabilities (file editing, terminal commands, code generation),
 * and ACP dispatching for multi-agent orchestration.
 */

export interface AgentAction {
  /** Unique identifier for the action. */
  id: string;
  type: "click" | "type" | "scroll" | "hotkey" | "shell" | "file_edit";
  /** Human-readable description of what this action does. */
  description: string;
}

export interface Skill {
  /** A named, replayable sequence of actions learned from a demonstration. */
  id: string;
  name: string;
  actions: AgentAction[];
  /** The recording ID this skill was derived from, if any. */
  sourceRecordingId?: string;
}

export interface AgentRun {
  id: string;
  skill: Skill;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
}
