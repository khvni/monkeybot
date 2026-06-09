import { EventEmitter } from "node:events";
import { DriverClient } from "./driver-client";
import { ModelRouter } from "./model-router";
import { SafetyGate } from "./safety-gate";
import { SessionManager } from "./session-manager";
import { ActionPipeline } from "./action-pipeline";
import type {
  OrchestratorConfig,
  PipelineResult,
  TaskSession,
  SessionStatus,
} from "./types";

/**
 * Top-level orchestrator that ties every subsystem together.
 *
 * Usage:
 *   const orc = new Orchestrator(config);
 *   await orc.start();
 *   const result = await orc.handleInput("Open the browser and go to example.com");
 *   await orc.stop();
 */
export class Orchestrator extends EventEmitter {
  private driver: DriverClient;
  private router: ModelRouter;
  private safety: SafetyGate;
  private sessions: SessionManager;
  private pipeline: ActionPipeline;
  private activeSessionId: string | null = null;

  constructor(config: OrchestratorConfig) {
    super();

    this.driver = new DriverClient({
      socketPath: config.driverSocketPath,
      requestTimeout: config.requestTimeout,
    });

    this.router = new ModelRouter(config.openRouterApiKey);

    this.safety = new SafetyGate(config.safety);

    this.sessions = new SessionManager(config.maxIterationsPerSession);

    this.pipeline = new ActionPipeline(
      this.driver,
      this.router,
      this.safety,
      this.sessions
    );

    // Wire kill switch to disconnect the driver.
    this.safety.onKill(() => {
      this.driver.kill().catch(() => {});
      this.emit("killed");
    });

    // Forward connection events.
    this.driver.on("connected", () => this.emit("driver:connected"));
    this.driver.on("disconnected", () => this.emit("driver:disconnected"));
    this.driver.on("reconnecting", (info) =>
      this.emit("driver:reconnecting", info)
    );

    // Forward session events.
    this.sessions.on("session:created", (s) =>
      this.emit("session:created", s)
    );
    this.sessions.on("session:completed", (s) =>
      this.emit("session:completed", s)
    );
    this.sessions.on("session:failed", (s) =>
      this.emit("session:failed", s)
    );
    this.sessions.on("session:killed", (s) =>
      this.emit("session:killed", s)
    );
  }

  /** Connect to the CUA driver. */
  async start(): Promise<void> {
    await this.driver.connect();
    this.emit("started");
  }

  /** Disconnect from the CUA driver. */
  async stop(): Promise<void> {
    this.driver.disconnect();
    this.emit("stopped");
  }

  /**
   * Handle user input (text or voice transcript).
   *
   * If there is no active session, a new one is created. Otherwise the input
   * is fed into the existing session for multi-turn interaction.
   */
  async handleInput(
    input: string,
    metadata: Record<string, unknown> = {}
  ): Promise<PipelineResult> {
    if (!this.driver.isConnected) {
      throw new Error("Orchestrator is not started — call start() first");
    }

    let sessionId: string;

    if (this.activeSessionId) {
      const session = this.sessions.get(this.activeSessionId);
      if (session && session.status !== "completed" && session.status !== "failed" && session.status !== "killed") {
        sessionId = this.activeSessionId;
      } else {
        sessionId = this.createSession(input, metadata);
      }
    } else {
      sessionId = this.createSession(input, metadata);
    }

    const result = await this.pipeline.run(sessionId, input);

    if (result.success || !this.activeSessionId) {
      this.activeSessionId = null;
    }

    return result;
  }

  /** Create a new session and set it as active. */
  startSession(
    goal: string,
    metadata: Record<string, unknown> = {}
  ): TaskSession {
    const session = this.sessions.create(goal, metadata);
    this.activeSessionId = session.id;
    return session;
  }

  /** Get a session by ID. */
  getSession(sessionId: string): TaskSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Get the currently active session. */
  getActiveSession(): TaskSession | undefined {
    return this.activeSessionId
      ? this.sessions.get(this.activeSessionId)
      : undefined;
  }

  /** List all sessions, optionally filtered by status. */
  listSessions(status?: SessionStatus): TaskSession[] {
    return status
      ? this.sessions.listByStatus(status)
      : this.sessions.list();
  }

  /** Trigger the kill switch. */
  killSwitch(): void {
    this.safety.triggerKillSwitch();
  }

  /** Reset the kill switch. */
  resetKillSwitch(): void {
    this.safety.resetKillSwitch();
  }

  /** Expose the safety gate for advanced configuration. */
  getSafetyGate(): SafetyGate {
    return this.safety;
  }

  /** Expose the model router for direct LLM calls. */
  getModelRouter(): ModelRouter {
    return this.router;
  }

  /** Expose the driver client for raw driver access. */
  getDriverClient(): DriverClient {
    return this.driver;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private createSession(
    goal: string,
    metadata: Record<string, unknown>
  ): string {
    const session = this.sessions.create(goal, metadata);
    this.activeSessionId = session.id;
    return session.id;
  }
}
