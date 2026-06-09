import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Trajectory, TrajectoryStep, ActionGraph, NLSummary } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Manages the local SQLite database for monkeybot.
 * Stores trajectories, action graphs, NL summaries, API keys, and allowlist.
 */
export class StorageManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  /** Run the schema migration to create all tables. */
  migrate(): void {
    const schemaPath = resolve(__dirname, "../src/schema.sql");
    const schema = readFileSync(schemaPath, "utf-8");
    this.db.exec(schema);
  }

  // -- Trajectories ----------------------------------------------------------

  insertTrajectory(trajectory: Trajectory): void {
    const insert = this.db.prepare(
      "INSERT INTO trajectories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
    );
    const insertStep = this.db.prepare(
      `INSERT INTO trajectory_steps
        (trajectory_id, step_index, action, x, y, text, timestamp, screenshot_path, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const tx = this.db.transaction(() => {
      insert.run(
        trajectory.id,
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
      name: row.name as string,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      steps: steps.map((s) => ({
        action: s.action as string,
        x: s.x as number | undefined,
        y: s.y as number | undefined,
        text: s.text as string | undefined,
        timestamp: s.timestamp as number,
        screenshotPath: s.screenshot_path as string | undefined,
        meta: s.meta ? JSON.parse(s.meta as string) : undefined,
      })),
    };
  }

  listTrajectories(): Trajectory[] {
    const rows = this.db
      .prepare("SELECT id FROM trajectories ORDER BY created_at DESC")
      .all() as { id: string }[];
    return rows
      .map((r) => this.getTrajectory(r.id))
      .filter((t): t is Trajectory => t !== undefined);
  }

  // -- API keys (onboarding) -------------------------------------------------

  setApiKey(service: string, apiKey: string): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO api_keys (service, api_key, stored_at) VALUES (?, ?, ?)"
      )
      .run(service, apiKey, Math.floor(Date.now() / 1000));
  }

  getApiKey(service: string): string | undefined {
    const row = this.db
      .prepare("SELECT api_key FROM api_keys WHERE service = ?")
      .get(service) as { api_key: string } | undefined;
    return row?.api_key;
  }

  // -- App allowlist (safety) ------------------------------------------------

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

  close(): void {
    this.db.close();
  }
}
