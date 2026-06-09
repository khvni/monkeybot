import { ScreenRecorder } from "./recorder";
import { TrajectoryGenerator } from "./trajectory-generator";
import { GraphBuilder } from "./graph-builder";
import { Summarizer } from "./summarizer";
import type { StorageManager } from "@monkeybot/storage";
import type { RecordingSession, LearningPipelineConfig, LearningResult } from "./types";
import { randomUUID } from "node:crypto";

/**
 * Orchestrates the full learning loop:
 * 1. User initiates recording ("watch me")
 * 2. Screen + input events are captured
 * 3. Raw recording → Trajectory
 * 4. Trajectory → Action Graph (DAG)
 * 5. Generate NL summary via OpenRouter
 * 6. Store all three representations linked by workflow ID
 */
export class LearningPipeline {
  private recorder: ScreenRecorder;
  private trajectoryGenerator: TrajectoryGenerator;
  private graphBuilder: GraphBuilder;
  private summarizer: Summarizer;
  private storage: StorageManager;
  private config: LearningPipelineConfig;

  constructor(config: LearningPipelineConfig, storage: StorageManager) {
    this.config = config;
    this.storage = storage;
    this.recorder = new ScreenRecorder(config);
    this.trajectoryGenerator = new TrajectoryGenerator();
    this.graphBuilder = new GraphBuilder();
    this.summarizer = new Summarizer(config);
  }

  /**
   * Get the recorder for advanced control (frame providers, event injection).
   */
  getRecorder(): ScreenRecorder {
    return this.recorder;
  }

  /**
   * Start a new learning session. Creates a workflow and begins recording.
   * Returns the workflow ID for tracking.
   */
  startRecording(workflowName: string, description?: string): string {
    const workflowId = randomUUID();
    this.storage.createWorkflow(workflowId, workflowName, description);
    this.storage.updateWorkflowStatus(workflowId, "recording");
    this.recorder.start(workflowId);
    return workflowId;
  }

  /**
   * Stop the current recording and process it through the full pipeline.
   * Generates trajectory, action graph, and NL summary, all linked by workflow ID.
   */
  async stopAndProcess(): Promise<LearningResult> {
    const session = this.recorder.stop();
    if (!session) {
      throw new Error("No active recording session to stop.");
    }

    return this.processSession(session);
  }

  /**
   * Process a recording session that was captured externally.
   * Useful for batch processing or replaying past recordings.
   */
  async processSession(session: RecordingSession): Promise<LearningResult> {
    const workflowId = session.workflowId;
    this.storage.updateWorkflowStatus(workflowId, "processing");

    // Step 1: Generate trajectory from recording
    const trajectory = this.trajectoryGenerator.generate(session);
    this.storage.insertTrajectory(trajectory);

    // Step 2: Build action graph from trajectory
    const graph = this.graphBuilder.build([trajectory]);
    this.storage.insertActionGraph(graph);

    // Step 3: Generate NL summaries (with error recovery)
    let workflowSummary: import("@monkeybot/storage").NLSummary;
    try {
      const trajectorySummary = await this.summarizer.summarizeTrajectory(
        trajectory,
        workflowId
      );
      this.storage.insertNLSummary(trajectorySummary);

      const graphSummary = await this.summarizer.summarizeActionGraph(graph, workflowId);
      this.storage.insertNLSummary(graphSummary);

      workflowSummary = await this.summarizer.summarizeWorkflow(
        workflowId,
        [trajectory],
        [graph]
      );
      this.storage.insertNLSummary(workflowSummary);
    } catch (err) {
      // On LLM failure, still mark workflow complete with trajectories/graph saved
      this.storage.updateWorkflowStatus(workflowId, "complete");
      const fallbackSummary = `Workflow recorded with ${trajectory.steps.length} steps (summary generation failed)`;
      workflowSummary = {
        id: randomUUID(),
        workflowId,
        targetType: "workflow",
        targetId: workflowId,
        summary: fallbackSummary,
        generatedBy: "fallback",
        createdAt: Math.floor(Date.now() / 1000),
      };
      this.storage.insertNLSummary(workflowSummary);

      return {
        workflowId,
        trajectory: this.trajectoryGenerator.toResult(trajectory),
        actionGraph: this.graphBuilder.toResult(graph),
        summary: this.summarizer.toResult(workflowSummary),
      };
    }

    // Mark workflow as complete
    this.storage.updateWorkflowStatus(workflowId, "complete");

    return {
      workflowId,
      trajectory: this.trajectoryGenerator.toResult(trajectory),
      actionGraph: this.graphBuilder.toResult(graph),
      summary: this.summarizer.toResult(workflowSummary),
    };
  }

  /**
   * Process a session without LLM calls (offline mode).
   * Generates trajectory and action graph but skips NL summaries.
   */
  processSessionOffline(session: RecordingSession): {
    workflowId: string;
    trajectoryId: string;
    graphId: string;
  } {
    const workflowId = session.workflowId;
    this.storage.updateWorkflowStatus(workflowId, "processing");

    const trajectory = this.trajectoryGenerator.generate(session);
    this.storage.insertTrajectory(trajectory);

    const graph = this.graphBuilder.build([trajectory]);
    this.storage.insertActionGraph(graph);

    this.storage.updateWorkflowStatus(workflowId, "complete");

    return {
      workflowId,
      trajectoryId: trajectory.id,
      graphId: graph.id,
    };
  }

  /**
   * Check if a recording is currently in progress.
   */
  isRecording(): boolean {
    return this.recorder.isRecording();
  }

  /**
   * Find similar past workflows given a natural language query.
   */
  findSimilar(query: string, limit = 5) {
    return this.storage.findSimilarWorkflows(query, limit);
  }
}
