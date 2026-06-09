/**
 * @monkeybot/monkey-do
 *
 * Action harness: computer-use agent with accessibility-based cursor control,
 * coding capabilities (file editing, terminal commands, code generation),
 * and ACP dispatching for multi-agent orchestration.
 */

import type { Recording, CapturedEvent } from "@monkeybot/monkey-see";
import type { VoiceIntent } from "@monkeybot/monkey-say";

export type { Recording, CapturedEvent } from "@monkeybot/monkey-see";
export type { VoiceIntent, VoiceSession } from "@monkeybot/monkey-say";

export interface AgentAction {
  /** Unique identifier for the action. */
  id: string;
  type: "click" | "type" | "scroll" | "hotkey" | "shell" | "file_edit";
  /** Human-readable description of what this action does. */
  description: string;
  /** The captured event this action was derived from, if any. */
  sourceEvent?: CapturedEvent;
}

export interface Skill {
  /** A named, replayable sequence of actions learned from a demonstration. */
  id: string;
  name: string;
  actions: AgentAction[];
  /** The recording this skill was derived from, if any. */
  sourceRecording?: Recording;
}

export interface AgentRun {
  id: string;
  skill: Skill;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  /** Voice directive that triggered this run, if any. */
  voiceDirective?: VoiceIntent;
}
