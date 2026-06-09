import { createConnection, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  DriverMessage,
  DriverResponse,
  DriverClientOptions,
} from "./types";

const DEFAULT_SOCKET_PATH = "/tmp/monkeybot-cua-driver.sock";
const DEFAULT_REQUEST_TIMEOUT = 30_000;
const DEFAULT_RECONNECT_INTERVAL = 2_000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;

interface PendingRequest {
  resolve: (resp: DriverResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Client for communicating with the Rust CUA driver daemon over a Unix socket.
 * Sends newline-delimited JSON messages and receives newline-delimited JSON responses.
 *
 * Features beyond the basic scaffold:
 * - Automatic reconnection with configurable back-off
 * - Per-request timeouts
 * - EventEmitter for connection lifecycle
 * - Convenience helpers: `executeAction`, `screenshot`, `kill`, `status`
 */
export class DriverClient extends EventEmitter {
  private socketPath: string;
  private socket: Socket | null = null;
  private connected = false;
  private reconnectEnabled: boolean;
  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private requestTimeout: number;
  private pendingRequests = new Map<string, PendingRequest>();
  private buffer = "";
  private reconnecting = false;

  constructor(options: DriverClientOptions = {}) {
    super();
    this.socketPath = options.socketPath ?? DEFAULT_SOCKET_PATH;
    this.reconnectEnabled = options.reconnect ?? true;
    this.reconnectInterval =
      options.reconnectInterval ?? DEFAULT_RECONNECT_INTERVAL;
    this.maxReconnectAttempts =
      options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this.requestTimeout = options.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;
  }

  /** Connect to the Rust driver daemon. */
  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.socket = createConnection(this.socketPath, () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.reconnecting = false;
        this.emit("connected");
        resolve();
      });

      this.socket.on("data", (data: Buffer) => this.handleData(data));

      this.socket.on("error", (err: Error) => {
        if (!this.connected) {
          reject(err);
          return;
        }
        this.emit("error", err);
      });

      this.socket.on("close", () => {
        const wasConnected = this.connected;
        this.connected = false;
        this.emit("disconnected");

        this.rejectAllPending(new Error("Connection closed"));

        if (wasConnected && this.reconnectEnabled && !this.reconnecting) {
          this.attemptReconnect();
        }
      });
    });
  }

  /** Send a raw message to the driver and await the response. */
  async send(message: DriverMessage): Promise<DriverResponse> {
    if (!this.socket || !this.connected) {
      throw new Error("Not connected to CUA driver");
    }

    return new Promise<DriverResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(
          new Error(`Request ${message.id} timed out after ${this.requestTimeout}ms`)
        );
      }, this.requestTimeout);

      this.pendingRequests.set(message.id, { resolve, reject, timer });
      const payload = JSON.stringify(message) + "\n";
      this.socket!.write(payload);
    });
  }

  /** Execute a computer-use action on the driver. */
  async executeAction(
    actionPayload: Record<string, unknown>
  ): Promise<DriverResponse> {
    return this.send({
      id: randomUUID(),
      type: "execute_action",
      payload: actionPayload,
    });
  }

  /** Request a screenshot from the driver. */
  async screenshot(): Promise<DriverResponse> {
    return this.send({ id: randomUUID(), type: "screenshot" });
  }

  /** Send a kill command to the driver. */
  async kill(): Promise<DriverResponse> {
    return this.send({ id: randomUUID(), type: "kill" });
  }

  /** Request the status of the driver. */
  async status(): Promise<DriverResponse> {
    return this.send({ id: randomUUID(), type: "status" });
  }

  /** Disconnect from the driver. */
  disconnect(): void {
    this.reconnectEnabled = false;
    this.rejectAllPending(new Error("Client disconnected"));
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

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
          clearTimeout(pending.timer);
          this.pendingRequests.delete(response.id);
          pending.resolve(response);
        }
      } catch {
        this.emit("error", new Error(`Failed to parse response: ${line}`));
      }
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(err);
      this.pendingRequests.delete(id);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit(
        "error",
        new Error(
          `Max reconnect attempts (${this.maxReconnectAttempts}) reached`
        )
      );
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;
    const delay = this.reconnectInterval * this.reconnectAttempts;

    this.emit("reconnecting", {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delay,
    });

    setTimeout(() => {
      this.connect().catch(() => {
        /* reconnect failure handled by close event */
      });
    }, delay);
  }
}
