import { createConnection, type Socket } from "node:net";
import type { DriverMessage, DriverResponse } from "./types";

const DEFAULT_SOCKET_PATH = "/tmp/monkeybot-cua-driver.sock";

/**
 * Client for communicating with the Rust CUA driver daemon over a Unix socket.
 * Sends JSON-encoded messages and receives JSON-encoded responses (newline-delimited).
 */
export class DriverClient {
  private socketPath: string;
  private socket: Socket | null = null;
  private connected = false;
  private pendingRequests = new Map<
    string,
    {
      resolve: (resp: DriverResponse) => void;
      reject: (err: Error) => void;
    }
  >();
  private buffer = "";

  constructor(socketPath = DEFAULT_SOCKET_PATH) {
    this.socketPath = socketPath;
  }

  /** Connect to the Rust driver daemon. */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = createConnection(this.socketPath, () => {
        this.connected = true;
        console.log(`[DriverClient] Connected to ${this.socketPath}`);
        resolve();
      });

      this.socket.on("data", (data: Buffer) => this.handleData(data));
      this.socket.on("error", (err: Error) => {
        if (!this.connected) reject(err);
        console.error("[DriverClient] Socket error:", err.message);
      });
      this.socket.on("close", () => {
        this.connected = false;
        console.log("[DriverClient] Disconnected");
      });
    });
  }

  /** Send a message to the driver and await the response. */
  async send(message: DriverMessage): Promise<DriverResponse> {
    if (!this.socket || !this.connected) {
      throw new Error("Not connected to CUA driver");
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(message.id, { resolve, reject });
      const payload = JSON.stringify(message) + "\n";
      this.socket!.write(payload);
    });
  }

  /** Disconnect from the driver. */
  disconnect(): void {
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString();
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response: DriverResponse = JSON.parse(line);
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          pending.resolve(response);
        }
      } catch {
        console.error("[DriverClient] Failed to parse response:", line);
      }
    }
  }
}
