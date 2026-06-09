import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, platform } from "node:os";
import { randomBytes } from "node:crypto";
import { PlaybackError } from "./errors";
import { commandExists } from "./utils";

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
  private processing = false;
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
      if (!this.processing) {
        void this.processQueue();
      }
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
    this.processing = false;
  }

  clear(): void {
    const pending = this.queue.splice(0);
    for (const item of pending) {
      item.reject(new PlaybackError("Queue cleared."));
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

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

    this.processing = false;
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

        proc.on("close", (code) => {
          this.currentProcess = null;
          if (code === 0 || code === null) {
            resolve();
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
