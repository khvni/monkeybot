/** A single step in a recorded trajectory. */
export interface TrajectoryStep {
  action: string;
  x?: number;
  y?: number;
  text?: string;
  timestamp: number;
  screenshotPath?: string;
  meta?: Record<string, unknown>;
}

/** A raw recorded trajectory (sequence of user/agent actions). */
export interface Trajectory {
  id: string;
  name: string;
  steps: TrajectoryStep[];
  createdAt: number;
  updatedAt: number;
}

/** A node in an abstracted action graph. */
export interface ActionNode {
  id: string;
  label: string;
  actionType: string;
  parameters?: Record<string, unknown>;
}

/** An edge in an abstracted action graph. */
export interface ActionEdge {
  from: string;
  to: string;
  condition?: string;
}

/** An abstracted action graph derived from one or more trajectories. */
export interface ActionGraph {
  id: string;
  name: string;
  nodes: ActionNode[];
  edges: ActionEdge[];
  trajectoryIds: string[];
  createdAt: number;
}

/** A natural language summary of a workflow/skill. */
export interface NLSummary {
  id: string;
  targetType: "trajectory" | "action_graph";
  targetId: string;
  summary: string;
  generatedBy: string;
  createdAt: number;
}
