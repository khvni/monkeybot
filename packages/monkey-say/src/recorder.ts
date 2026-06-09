import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { platform } from "node:os";
import { RecordingError } from "./errors";
import { commandExists } from "./utils";
import type { RecorderConfig } from "./types";

const DEFAULTS = {
  sampleRate: 16_000,
  channels: 1,
  bitDepth: 16,
} as const;

interface RecordingTool {
  command: string;
  args: string[];
}

function detectRecordingTool(
  sampleRate: number,
  channels: number,
  bitDepth: number,
): RecordingTool {
  const os = platform();

  if (os === "darwin" && commandExists("rec")) {
    return {
      command: "rec",
      args: [
        "-q", "-r", String(sampleRate), "-c", String(channels),
        "-b", String(bitDepth), "-e", "signed-integer",
        "-t", "raw", "--endian", "little", "-",
      ],
    };
  }

  if (os === "linux" && commandExists("arecord")) {
    return {
      command: "arecord",
      args: [
        "-f", `S${bitDepth}_LE`, "-r", String(sampleRate),
        "-c", String(channels), "-t", "raw", "-",
      ],
    };
  }

  if (commandExists("sox")) {
    return {
      command: "sox",
      args: [
        "-d", "-q", "-r", String(sampleRate), "-c", String(channels),
        "-b", String(bitDepth), "-e", "signed-integer",
        "-t", "raw", "--endian", "little", "-",
      ],
    };
  }

  if (commandExists("rec")) {
    return {
      command: "rec",
      args: [
        "-q", "-r", String(sampleRate), "-c", String(channels),
        "-b", String(bitDepth), "-e", "signed-integer",
        "-t", "raw", "--endian", "little", "-",
      ],
    };
  }

  throw new RecordingError(
    "No audio recording tool found. " +
      "Install SoX (sox/rec) or ALSA utils (arecord) for microphone capture.",
  );
}

function createWavBuffer(
  pcmData: Buffer,
  sampleRate: number,
  channels: number,
  bitDepth: number,
): Buffer {
  const header = Buffer.alloc(44);
  const dataLength = pcmData.length;
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  return Buffer.concat([header, pcmData]);
}

export class MicrophoneRecorder {
  private process: ChildProcess | null = null;
  private chunks: Buffer[] = [];
  private lastError: RecordingError | null = null;
  private readonly sampleRate: number;
  private readonly channels: number;
  private readonly bitDepth: number;

  constructor(config?: RecorderConfig) {
    this.sampleRate = config?.sampleRate ?? DEFAULTS.sampleRate;
    this.channels = config?.channels ?? DEFAULTS.channels;
    this.bitDepth = config?.bitDepth ?? DEFAULTS.bitDepth;
  }

  get isRecording(): boolean {
    return this.process !== null;
  }

  start(): void {
    if (this.process) {
      throw new RecordingError("Recording is already in progress.");
    }

    this.chunks = [];
    this.lastError = null;

    const tool = detectRecordingTool(
      this.sampleRate,
      this.channels,
      this.bitDepth,
    );

    this.process = spawn(tool.command, tool.args, {
      stdio: ["ignore", "pipe", "ignore"],
    });

    this.process.stdout!.on("data", (chunk: Buffer) => {
      this.chunks.push(chunk);
    });

    this.process.on("error", (err) => {
      this.process = null;
      this.lastError = new RecordingError(
        `Recording process error: ${err.message}`,
      );
    });
  }

  async stop(): Promise<Buffer> {
    if (this.lastError) {
      const err = this.lastError;
      this.lastError = null;
      this.chunks = [];
      throw err;
    }

    if (!this.process) {
      throw new RecordingError("No recording in progress.");
    }

    const proc = this.process;
    this.process = null;

    return new Promise<Buffer>((resolve, reject) => {
      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        this.chunks = [];
        reject(new RecordingError("Recording stop timed out after 5 seconds."));
      }, 5_000);

      proc.on("close", () => {
        clearTimeout(timeout);
        const pcmData = Buffer.concat(this.chunks);
        this.chunks = [];

        if (pcmData.length === 0) {
          reject(
            new RecordingError(
              "No audio data captured. Check microphone access and permissions.",
            ),
          );
          return;
        }

        resolve(
          createWavBuffer(pcmData, this.sampleRate, this.channels, this.bitDepth),
        );
      });

      proc.kill("SIGTERM");
    });
  }

  abort(): void {
    if (this.process) {
      this.process.kill("SIGKILL");
      this.process = null;
      this.chunks = [];
    }
  }
}
