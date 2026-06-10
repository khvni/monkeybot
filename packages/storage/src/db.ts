import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { encrypt, decrypt } from "./crypto";
import type {
  Trajectory,
  TrajectoryStep,
  ActionGraph,
  ActionNode,
  ActionEdge,
  NLSummary,
  Workflow,
  WorkflowStatus,
  SimilarWorkflow,
} from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface StorageManagerOptions {
  dbPath: string;
  encryptionPassphrase: string;
}

/**
 * Manages the local SQLite database for monkeybot.
 * Stores workflows, trajectories, action graphs, NL summaries, API keys, and allowlist.
 */
export class StorageManager {
  private db: Database.Database;
  private passphrase: string;

  constructor(opts: StorageManagerOptions) {
    this.db = new Database(opts.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    if (!opts.encryptionPassphrase) {
      throw new Error("encryptionPassphrase is required — do not use a default passphrase");
    }
    this.passphrase = opts.encryptionPassphrase;
  }

  /** Run the schema migration to create all tables. */
  migrate(): void {
    const schemaPath = resolve(__dirname, "../src/schema.sql");
    const schema = readFileSync(schemaPath, "utf-8");
    this.db.exec(schema);
  }

  // ============================================================
  // Workflows
  // ============================================================

  createWorkflow(id: string, name: string, description?: string): Workflow {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        "INSERT INTO workflows (id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)"
      )
      .run(id, name, description ?? null, now, now);
    return { id, name, description, status: "draft", createdAt: now, updatedAt: now };
  }

  getWorkflow(id: string): Workflow | undefined {
    const row = this.db
      .prepare("SELECT * FROM workflows WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.rowToWorkflow(row);
  }

  listWorkflows(): Workflow[] {
    const rows = this.db
      .prepare("SELECT * FROM workflows ORDER BY created_at DESC")
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToWorkflow(r));
  }

  updateWorkflowStatus(id: string, status: WorkflowStatus): void {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare("UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, now, id);
  }

  deleteWorkflow(id: string): void {
    this.db.prepare("DELETE FROM workflows WHERE id = ?").run(id);
  }

  private rowToWorkflow(row: Record<string, unknown>): Workflow {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      status: row.status as WorkflowStatus,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  // ============================================================
  // Trajectories
  // ============================================================

  insertTrajectory(trajectory: Trajectory): void {
    const insert = this.db.prepare(
      "INSERT INTO trajectories (id, workflow_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    );
    const insertStep = this.db.prepare(
      `INSERT INTO trajectory_steps
        (trajectory_id, step_index, action, x, y, text, timestamp, screenshot_path, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const tx = this.db.transaction(() => {
      insert.run(
        trajectory.id,
        trajectory.workflowId ?? null,
        trajectory.name,
        trajectory.createdAt,
        trajectory.updatedAt
      );
      trajectory.steps.forEach((step, i) => {
        insertStep.run(
          trajectory.id,
          i,
          step.action,
          step.x ?? null,
          step.y ?? null,
          step.text ?? null,
          step.timestamp,
          step.screenshotPath ?? null,
          step.meta ? JSON.stringify(step.meta) : null
        );
      });
    });

    tx();
  }

  getTrajectory(id: string): Trajectory | undefined {
    const row = this.db
      .prepare("SELECT * FROM trajectories WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;

    const steps = this.db
      .prepare(
        "SELECT * FROM trajectory_steps WHERE trajectory_id = ? ORDER BY step_index"
      )
      .all(id) as Record<string, unknown>[];

    return {
      id: row.id as string,
      workflowId: row.workflow_id as string | undefined,
      name: row.name as string,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      steps: steps.map((s) => this.rowToStep(s)),
    };
  }

  listTrajectories(workflowId?: string): Trajectory[] {
    let rows: Record<string, unknown>[];
    if (workflowId) {
      rows = this.db
        .prepare("SELECT * FROM trajectories WHERE workflow_id = ? ORDER BY created_at DESC")
        .all(workflowId) as Record<string, unknown>[];
    } else {
      rows = this.db
        .prepare("SELECT * FROM trajectories ORDER BY created_at DESC")
        .all() as Record<string, unknown>[];
    }
    return rows.map((r) => {
      const steps = this.db
        .prepare("SELECT * FROM trajectory_steps WHERE trajectory_id = ? ORDER BY step_index")
        .all(r.id as string) as Record<string, unknown>[];
      return {
        id: r.id as string,
        workflowId: r.workflow_id as string | undefined,
        name: r.name as string,
        createdAt: r.created_at as number,
        updatedAt: r.updated_at as number,
        steps: steps.map((s) => this.rowToStep(s)),
      };
    });
  }

  deleteTrajectory(id: string): void {
    this.db.prepare("DELETE FROM trajectories WHERE id = ?").run(id);
  }

  private rowToStep(s: Record<string, unknown>): TrajectoryStep {
    return {
      action: s.action as string,
      x: s.x as number | undefined,
      y: s.y as number | undefined,
      text: s.text as string | undefined,
      timestamp: s.timestamp as number,
      screenshotPath: s.screenshot_path as string | undefined,
      meta: s.meta ? JSON.parse(s.meta as string) : undefined,
    };
  }

  // ============================================================
  // Action Graphs
  // ============================================================

  insertActionGraph(graph: ActionGraph): void {
    const insertGraph = this.db.prepare(
      "INSERT INTO action_graphs (id, workflow_id, name, created_at) VALUES (?, ?, ?, ?)"
    );
    const insertTrajectoryLink = this.db.prepare(
      "INSERT INTO action_graph_trajectories (graph_id, trajectory_id) VALUES (?, ?)"
    );
    const insertNode = this.db.prepare(
      "INSERT INTO action_nodes (id, graph_id, label, action_type, parameters) VALUES (?, ?, ?, ?, ?)"
    );
    const insertEdge = this.db.prepare(
      "INSERT INTO action_edges (graph_id, from_node, to_node, condition) VALUES (?, ?, ?, ?)"
    );

    const tx = this.db.transaction(() => {
      insertGraph.run(graph.id, graph.workflowId ?? null, graph.name, graph.createdAt);
      for (const tid of graph.trajectoryIds) {
        insertTrajectoryLink.run(graph.id, tid);
      }
      for (const node of graph.nodes) {
        insertNode.run(
          node.id,
          graph.id,
          node.label,
          node.actionType,
          node.parameters ? JSON.stringify(node.parameters) : null
        );
      }
      for (const edge of graph.edges) {
        insertEdge.run(graph.id, edge.from, edge.to, edge.condition ?? null);
      }
    });

    tx();
  }

  getActionGraph(id: string): ActionGraph | undefined {
    const row = this.db
      .prepare("SELECT * FROM action_graphs WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;

    const trajectoryRows = this.db
      .prepare("SELECT trajectory_id FROM action_graph_trajectories WHERE graph_id = ?")
      .all(id) as { trajectory_id: string }[];

    const nodeRows = this.db
      .prepare("SELECT * FROM action_nodes WHERE graph_id = ?")
      .all(id) as Record<string, unknown>[];

    const edgeRows = this.db
      .prepare("SELECT * FROM action_edges WHERE graph_id = ?")
      .all(id) as Record<string, unknown>[];

    return {
      id: row.id as string,
      workflowId: row.workflow_id as string | undefined,
      name: row.name as string,
      trajectoryIds: trajectoryRows.map((r) => r.trajectory_id),
      nodes: nodeRows.map((n) => this.rowToNode(n)),
      edges: edgeRows.map((e) => this.rowToEdge(e)),
      createdAt: row.created_at as number,
    };
  }

  listActionGraphs(workflowId?: string): ActionGraph[] {
    let rows: Record<string, unknown>[];
    if (workflowId) {
      rows = this.db
        .prepare("SELECT id FROM action_graphs WHERE workflow_id = ? ORDER BY created_at DESC")
        .all(workflowId) as Record<string, unknown>[];
    } else {
      rows = this.db
        .prepare("SELECT id FROM action_graphs ORDER BY created_at DESC")
        .all() as Record<string, unknown>[];
    }
    return rows
      .map((r) => this.getActionGraph(r.id as string))
      .filter((g): g is ActionGraph => g !== undefined);
  }

  deleteActionGraph(id: string): void {
    this.db.prepare("DELETE FROM action_graphs WHERE id = ?").run(id);
  }

  private rowToNode(n: Record<string, unknown>): ActionNode {
    return {
      id: n.id as string,
      label: n.label as string,
      actionType: n.action_type as string,
      parameters: n.parameters ? JSON.parse(n.parameters as string) : undefined,
    };
  }

  private rowToEdge(e: Record<string, unknown>): ActionEdge {
    return {
      from: e.from_node as string,
      to: e.to_node as string,
      condition: e.condition as string | undefined,
    };
  }

  // ============================================================
  // NL Summaries
  // ============================================================

  insertNLSummary(summary: NLSummary): void {
    this.db
      .prepare(
        `INSERT INTO nl_summaries (id, workflow_id, target_type, target_id, summary, generated_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        summary.id,
        summary.workflowId ?? null,
        summary.targetType,
        summary.targetId,
        summary.summary,
        summary.generatedBy,
        summary.createdAt
      );
  }

  getNLSummary(id: string): NLSummary | undefined {
    const row = this.db
      .prepare("SELECT * FROM nl_summaries WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.rowToNLSummary(row);
  }

  listNLSummaries(workflowId?: string): NLSummary[] {
    let rows: Record<string, unknown>[];
    if (workflowId) {
      rows = this.db
        .prepare("SELECT * FROM nl_summaries WHERE workflow_id = ? ORDER BY created_at DESC")
        .all(workflowId) as Record<string, unknown>[];
    } else {
      rows = this.db
        .prepare("SELECT * FROM nl_summaries ORDER BY created_at DESC")
        .all() as Record<string, unknown>[];
    }
    return rows.map((r) => this.rowToNLSummary(r));
  }

  deleteNLSummary(id: string): void {
    this.db.prepare("DELETE FROM nl_summaries WHERE id = ?").run(id);
  }

  private rowToNLSummary(row: Record<string, unknown>): NLSummary {
    return {
      id: row.id as string,
      workflowId: row.workflow_id as string | undefined,
      targetType: row.target_type as NLSummary["targetType"],
      targetId: row.target_id as string,
      summary: row.summary as string,
      generatedBy: row.generated_by as string,
      createdAt: row.created_at as number,
    };
  }

  // ============================================================
  // API Keys (encrypted)
  // ============================================================

  setApiKey(service: string, apiKey: string): void {
    const payload = encrypt(apiKey, this.passphrase);
    this.db
      .prepare(
        "INSERT OR REPLACE INTO api_keys (service, encrypted_key, iv, auth_tag, salt, stored_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(service, payload.encrypted, payload.iv, payload.authTag, payload.salt, Math.floor(Date.now() / 1000));
  }

  getApiKey(service: string): string | undefined {
    const row = this.db
      .prepare("SELECT encrypted_key, iv, auth_tag, salt FROM api_keys WHERE service = ?")
      .get(service) as { encrypted_key: string; iv: string; auth_tag: string; salt: string } | undefined;
    if (!row) return undefined;
    return decrypt({
      encrypted: row.encrypted_key,
      iv: row.iv,
      authTag: row.auth_tag,
      salt: row.salt,
    }, this.passphrase);
  }

  deleteApiKey(service: string): void {
    this.db.prepare("DELETE FROM api_keys WHERE service = ?").run(service);
  }

  listApiKeyServices(): string[] {
    const rows = this.db
      .prepare("SELECT service FROM api_keys ORDER BY stored_at DESC")
      .all() as { service: string }[];
    return rows.map((r) => r.service);
  }

  // ============================================================
  // App Allowlist (safety)
  // ============================================================

  setAppAllowed(appId: string, appName: string, allowed: boolean): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO app_allowlist (app_id, app_name, allowed) VALUES (?, ?, ?)"
      )
      .run(appId, appName, allowed ? 1 : 0);
  }

  isAppAllowed(appId: string): boolean {
    const row = this.db
      .prepare("SELECT allowed FROM app_allowlist WHERE app_id = ?")
      .get(appId) as { allowed: number } | undefined;
    return row?.allowed === 1;
  }

  removeApp(appId: string): void {
    this.db.prepare("DELETE FROM app_allowlist WHERE app_id = ?").run(appId);
  }

  listAllowedApps(): { appId: string; appName: string; allowed: boolean }[] {
    const rows = this.db
      .prepare("SELECT * FROM app_allowlist ORDER BY app_name")
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      appId: r.app_id as string,
      appName: r.app_name as string,
      allowed: (r.allowed as number) === 1,
    }));
  }

  // ============================================================
  // Similarity Search
  // ============================================================

  /**
   * Find workflows with summaries similar to the query string.
   * Uses simple keyword overlap scoring (no external embedding model required).
   */
  findSimilarWorkflows(query: string, limit = 5): SimilarWorkflow[] {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const summaries = this.db
      .prepare(
        `SELECT ns.summary, ns.workflow_id, w.id, w.name, w.description, w.status, w.created_at, w.updated_at
         FROM nl_summaries ns
         JOIN workflows w ON ns.workflow_id = w.id
         WHERE ns.workflow_id IS NOT NULL
         ORDER BY ns.created_at DESC`
      )
      .all() as Record<string, unknown>[];

    const scored: SimilarWorkflow[] = [];
    const seen = new Set<string>();

    for (const row of summaries) {
      const workflowId = row.workflow_id as string;
      if (seen.has(workflowId)) continue;
      seen.add(workflowId);

      const summaryText = row.summary as string;
      const summaryTokens = this.tokenize(summaryText);
      const score = this.computeSimilarity(queryTokens, summaryTokens);

      if (score > 0) {
        scored.push({
          workflow: {
            id: row.id as string,
            name: row.name as string,
            description: row.description as string | undefined,
            status: row.status as WorkflowStatus,
            createdAt: row.created_at as number,
            updatedAt: row.updated_at as number,
          },
          score,
          matchedSummary: summaryText,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  private computeSimilarity(queryTokens: string[], docTokens: string[]): number {
    const docSet = new Set(docTokens);
    let matches = 0;
    for (const token of queryTokens) {
      if (docSet.has(token)) matches++;
    }
    // Jaccard-like: intersection / union
    const union = new Set([...queryTokens, ...docTokens]).size;
    return union > 0 ? matches / union : 0;
  }

  // ============================================================
  // Transactions
  // ============================================================

  /**
   * Execute a function inside a single SQLite transaction.
   * Automatically rolls back on error.
   */
  runInTransaction<T>(fn: () => T): T {
    const tx = this.db.transaction(fn);
    return tx();
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  close(): void {
    this.db.close();
  }
}
