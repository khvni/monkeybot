/** A single captured user event (click, keystroke, scroll, etc.). */
export interface CapturedEvent {
  type: "click" | "keydown" | "keyup" | "scroll" | "mouse_move";
  timestamp: number;
  x?: number;
  y?: number;
  key?: string;
  button?: "left" | "right" | "middle";
  scrollDelta?: { dx: number; dy: number };
  meta?: Record<string, unknown>;
}

/** A single frame captured from the screen. */
export interface ScreenFrame {
  timestamp: number;
  /** Base64-encoded image data or file path. */
  data: string;
  width: number;
  height: number;
}

/** Represents a full recording session. */
export interface RecordingSession {
  id: string;
  workflowId: string;
  startedAt: number;
  endedAt?: number;
  events: CapturedEvent[];
  frames: ScreenFrame[];
}

/** Configuration for the learning pipeline. */
export interface LearningPipelineConfig {
  openRouterApiKey: string;
  openRouterModel?: string;
  openRouterBaseUrl?: string;
  frameIntervalMs?: number;
}

/** Result of converting a recording to a trajectory. */
export interface TrajectoryResult {
  trajectoryId: string;
  stepCount: number;
}

/** Result of converting trajectories to an action graph. */
export interface ActionGraphResult {
  graphId: string;
  nodeCount: number;
  edgeCount: number;
}

/** Result of generating a natural language summary. */
export interface SummaryResult {
  summaryId: string;
  summary: string;
}

/** Full result of the learning pipeline for a workflow. */
export interface LearningResult {
  workflowId: string;
  trajectory: TrajectoryResult;
  actionGraph: ActionGraphResult;
  summary: SummaryResult;
}
