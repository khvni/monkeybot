-- Monkeybot local storage schema
-- Hybrid learning representation: raw trajectories + action graphs + NL summaries

----------------------------------------------------------------------
-- Workflows (top-level entity linking all representations)
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflows (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'recording', 'processing', 'complete')),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

----------------------------------------------------------------------
-- Raw trajectories
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trajectories (
  id          TEXT PRIMARY KEY,
  workflow_id TEXT REFERENCES workflows(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS trajectory_steps (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  trajectory_id   TEXT NOT NULL REFERENCES trajectories(id) ON DELETE CASCADE,
  step_index      INTEGER NOT NULL,
  action          TEXT NOT NULL,
  x               REAL,
  y               REAL,
  text            TEXT,
  timestamp       INTEGER NOT NULL,
  screenshot_path TEXT,
  meta            TEXT,  -- JSON blob
  UNIQUE(trajectory_id, step_index)
);

----------------------------------------------------------------------
-- Abstracted action graphs
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS action_graphs (
  id          TEXT PRIMARY KEY,
  workflow_id TEXT REFERENCES workflows(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS action_graph_trajectories (
  graph_id       TEXT NOT NULL REFERENCES action_graphs(id) ON DELETE CASCADE,
  trajectory_id  TEXT NOT NULL REFERENCES trajectories(id) ON DELETE CASCADE,
  PRIMARY KEY (graph_id, trajectory_id)
);

CREATE TABLE IF NOT EXISTS action_nodes (
  id          TEXT PRIMARY KEY,
  graph_id    TEXT NOT NULL REFERENCES action_graphs(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  action_type TEXT NOT NULL,
  parameters  TEXT  -- JSON blob
);

CREATE TABLE IF NOT EXISTS action_edges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  graph_id    TEXT NOT NULL REFERENCES action_graphs(id) ON DELETE CASCADE,
  from_node   TEXT NOT NULL REFERENCES action_nodes(id) ON DELETE CASCADE,
  to_node     TEXT NOT NULL REFERENCES action_nodes(id) ON DELETE CASCADE,
  condition   TEXT
);

----------------------------------------------------------------------
-- Natural language summaries
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nl_summaries (
  id            TEXT PRIMARY KEY,
  workflow_id   TEXT REFERENCES workflows(id) ON DELETE CASCADE,
  target_type   TEXT NOT NULL CHECK(target_type IN ('trajectory', 'action_graph', 'workflow')),
  target_id     TEXT NOT NULL,
  summary       TEXT NOT NULL,
  generated_by  TEXT NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

----------------------------------------------------------------------
-- API key storage (onboarding) — encrypted at rest
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  service       TEXT PRIMARY KEY,
  encrypted_key TEXT NOT NULL,
  iv            TEXT NOT NULL,
  auth_tag      TEXT NOT NULL,
  salt          TEXT NOT NULL,
  stored_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

----------------------------------------------------------------------
-- App allowlist (safety)
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_allowlist (
  app_id      TEXT PRIMARY KEY,
  app_name    TEXT NOT NULL,
  allowed     INTEGER NOT NULL DEFAULT 1,
  added_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

----------------------------------------------------------------------
-- Indexes for efficient querying
----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_trajectories_workflow ON trajectories(workflow_id);
CREATE INDEX IF NOT EXISTS idx_action_graphs_workflow ON action_graphs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_nl_summaries_workflow ON nl_summaries(workflow_id);
CREATE INDEX IF NOT EXISTS idx_nl_summaries_target ON nl_summaries(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_trajectory_steps_trajectory ON trajectory_steps(trajectory_id);
