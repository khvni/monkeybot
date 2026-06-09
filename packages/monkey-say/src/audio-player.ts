import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, platform } from "node:os";
import { randomBytes } from "node:crypto";
import { PlaybackError } from "./errors";
import { commandExists } from "./utils";
import { trackProcess } from "./process-registry";

interface PlaybackTool {
  command: string;
  getArgs: (filePath: string) => string[];
}

interface QueueItem {
  audio: Buffer;
  format: string;
  resolve: () => void;
  reject: (error: Error) => void;
}

function detectPlaybackTool(): PlaybackTool {
  const os = platform();

  if (os === "darwin" && commandExists("afplay")) {
    return { command: "afplay", getArgs: (f) => [f] };
  }

  if (commandExists("mpg123")) {
    return { command: "mpg123", getArgs: (f) => ["-q", f] };
  }

  if (commandExists("ffplay")) {
    return {
      command: "ffplay",
      getArgs: (f) => ["-nodisp", "-autoexit", "-loglevel", "quiet", f],
    };
  }

  if (commandExists("play")) {
    return { command: "play", getArgs: (f) => ["-q", f] };
  }

  throw new PlaybackError(
    "No audio playback tool found. " +
      "Install mpg123, ffplay (ffmpeg), SoX (play), or afplay (macOS).",
  );
}

function tempFilePath(ext: string): string {
  const name = `monkeybot-${randomBytes(8).toString("hex")}.${ext}`;
  return join(tmpdir(), name);
}

export class AudioPlayer {
  private queue: QueueItem[] = [];
  private runner: Promise<void> | null = null;
  private currentProcess: ChildProcess | null = null;
  private playbackTool: PlaybackTool | null = null;

  get isPlaying(): boolean {
    return this.currentProcess !== null;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  enqueue(audio: Buffer, format = "mp3"): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ audio, format, resolve, reject });
      this.ensureRunning();
    });
  }

  stop(): void {
    if (this.currentProcess) {
      this.currentProcess.kill("SIGTERM");
      this.currentProcess = null;
    }
    const pending = this.queue.splice(0);
    for (const item of pending) {
      item.reject(new PlaybackError("Playback stopped."));
    }
  }

  clear(): void {
    const pending = this.queue.splice(0);
    for (const item of pending) {
      item.reject(new PlaybackError("Queue cleared."));
    }
  }

  /**
   * Guarantee a single drain loop is active. If drain completes and items
   * were enqueued in the gap between the while-check and runner teardown,
   * the finally block re-checks and restarts.
   */
  private ensureRunning(): void {
    if (this.runner) return;
    this.runner = this.drain().finally(() => {
      this.runner = null;
      if (this.queue.length > 0) {
        this.ensureRunning();
      }
    });
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        await this.playBuffer(item.audio, item.format);
        item.resolve();
      } catch (err) {
        item.reject(
          err instanceof Error ? err : new PlaybackError(String(err)),
        );
      }
    }
  }

  private getPlaybackTool(): PlaybackTool {
    if (!this.playbackTool) {
      this.playbackTool = detectPlaybackTool();
    }
    return this.playbackTool;
  }

  private async playBuffer(audio: Buffer, format: string): Promise<void> {
    const tool = this.getPlaybackTool();
    const filePath = tempFilePath(format);

    writeFileSync(filePath, audio);

    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(tool.command, tool.getArgs(filePath), {
          stdio: "ignore",
        });
        this.currentProcess = proc;
        trackProcess(proc);

        proc.on("close", (code, signal) => {
          this.currentProcess = null;
          if (code === 0 && signal === null) {
            resolve();
          } else if (signal) {
            reject(
              new PlaybackError(
                `Playback process was terminated by signal ${signal}.`,
              ),
            );
          } else {
            reject(
              new PlaybackError(
                `Playback process exited with code ${code}.`,
              ),
            );
          }
        });

        proc.on("error", (err) => {
          this.currentProcess = null;
          reject(new PlaybackError(`Playback error: ${err.message}`));
        });
      });
    } finally {
      try {
        unlinkSync(filePath);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
