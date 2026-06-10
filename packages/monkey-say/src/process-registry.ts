import type { ChildProcess } from "node:child_process";

const tracked = new Set<ChildProcess>();
let handlersInstalled = false;

/** Register a spawned child process for cleanup on exit. */
export function trackProcess(proc: ChildProcess): void {
  tracked.add(proc);
  const remove = () => {
    tracked.delete(proc);
  };
  proc.once("close", remove);
  proc.once("exit", remove);
  installHandlers();
}

/** Remove a child process from the registry (e.g. after manual kill). */
export function untrackProcess(proc: ChildProcess): void {
  tracked.delete(proc);
}

function killAll(): void {
  for (const proc of tracked) {
    try {
      proc.kill("SIGKILL");
    } catch {
      // process may already be dead
    }
  }
  tracked.clear();
}

function installHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  process.on("exit", () => {
    killAll();
  });

  process.once("SIGINT", () => {
    killAll();
    process.exit(130);
  });

  process.once("SIGTERM", () => {
    killAll();
    process.exit(143);
  });
}
