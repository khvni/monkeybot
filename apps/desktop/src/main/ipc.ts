import { ipcMain, BrowserWindow, app, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { StorageManager } from "@monkeybot/storage";
import net from "node:net";

const DB_PATH = path.join(app.getPath("userData"), "monkeybot.db");
const KEY_PATH = path.join(app.getPath("userData"), "monkeybot.key");

/**
 * Read or generate a machine-local encryption passphrase.
 * Stored alongside the database so API keys can be encrypted at rest.
 */
function getPassphrase(): string {
  if (existsSync(KEY_PATH)) {
    return readFileSync(KEY_PATH, "utf-8").trim();
  }
  const passphrase = randomBytes(32).toString("hex");
  writeFileSync(KEY_PATH, passphrase, { mode: 0o600 });
  return passphrase;
}

let storage: StorageManager | null = null;

function getStorage(): StorageManager {
  if (!storage) {
    storage = new StorageManager({
      dbPath: DB_PATH,
      encryptionPassphrase: getPassphrase(),
    });
    storage.migrate();
  }
  return storage;
}

/** Socket path for the Rust CUA driver daemon. */
const DRIVER_SOCKET = process.env.MONKEYBOT_DRIVER_SOCKET
  ?? path.join(app.getPath("userData"), "cua-driver.sock");

let driverConnected = false;
let driverSocket: net.Socket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** Bullet character used for key masking — never persist values containing it. */
const MASK_CHAR = "\u2022";

function isMaskedValue(value: string): boolean {
  return value.includes(MASK_CHAR);
}

/**
 * Validate that an IPC event originated from the expected renderer.
 * Rejects spoofed messages from compromised or untrusted renderer processes.
 */
function validateSender(
  event: IpcMainInvokeEvent,
  trustedId: number
): void {
  if (event.sender.id !== trustedId) {
    throw new Error("IPC rejected: sender is not the trusted renderer.");
  }
}

function connectToDriver(window: BrowserWindow): void {
  if (driverSocket) {
    driverSocket.destroy();
    driverSocket = null;
  }

  const sock = net.createConnection(DRIVER_SOCKET);

  sock.on("connect", () => {
    driverConnected = true;
    window.webContents.send("driver-status", true);
  });

  sock.on("error", () => {
    driverConnected = false;
    window.webContents.send("driver-status", false);
  });

  sock.on("close", () => {
    driverConnected = false;
    window.webContents.send("driver-status", false);
    scheduleReconnect(window);
  });

  driverSocket = sock;
}

function scheduleReconnect(window: BrowserWindow): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToDriver(window);
  }, 5000);
}

function sendToDriver(payload: Record<string, unknown>): boolean {
  if (!driverSocket || !driverConnected) return false;
  try {
    driverSocket.write(JSON.stringify(payload) + "\n");
    return true;
  } catch {
    return false;
  }
}

/**
 * Register IPC handlers for communication between main and renderer processes.
 */
export function registerIpcHandlers(window: BrowserWindow): void {
  const trustedWebContentsId = window.webContents.id;

  // Attempt initial connection to the CUA driver.
  connectToDriver(window);

  // Onboarding: save API keys to SQLite.
  // Guard: reject values containing mask characters to prevent overwriting
  // real keys with display-only masked strings from get-api-keys.
  ipcMain.handle(
    "save-api-keys",
    async (
      event,
      keys: { openRouter: string; assemblyAi: string; elevenLabs: string }
    ) => {
      validateSender(event, trustedWebContentsId);
      try {
        const db = getStorage();
        if (keys.openRouter && !isMaskedValue(keys.openRouter)) {
          db.setApiKey("openrouter", keys.openRouter);
        }
        if (keys.assemblyAi && !isMaskedValue(keys.assemblyAi)) {
          db.setApiKey("assemblyai", keys.assemblyAi);
        }
        if (keys.elevenLabs && !isMaskedValue(keys.elevenLabs)) {
          db.setApiKey("elevenlabs", keys.elevenLabs);
        }
        return { success: true };
      } catch (err) {
        console.error("[IPC] Failed to save API keys:", err);
        return { success: false };
      }
    }
  );

  // Check if onboarding is complete (OpenRouter key must exist).
  ipcMain.handle("check-onboarding", async (event) => {
    validateSender(event, trustedWebContentsId);
    try {
      const db = getStorage();
      const key = db.getApiKey("openrouter");
      return { complete: !!key };
    } catch {
      return { complete: false };
    }
  });

  // Get saved API keys (masked for display only — never persist these values).
  ipcMain.handle("get-api-keys", async (event) => {
    validateSender(event, trustedWebContentsId);
    try {
      const db = getStorage();
      const openRouter = db.getApiKey("openrouter");
      const assemblyAi = db.getApiKey("assemblyai");
      const elevenLabs = db.getApiKey("elevenlabs");
      return {
        openRouter: openRouter ? maskKey(openRouter) : "",
        assemblyAi: assemblyAi ? maskKey(assemblyAi) : "",
        elevenLabs: elevenLabs ? maskKey(elevenLabs) : "",
      };
    } catch {
      return { openRouter: "", assemblyAi: "", elevenLabs: "" };
    }
  });

  // Send a text message to the agent via the CUA driver.
  ipcMain.handle("send-message", async (event, message: string) => {
    validateSender(event, trustedWebContentsId);
    const sent = sendToDriver({ type: "user_message", content: message });
    if (sent) {
      return { response: "Message sent to agent." };
    }
    return { response: "Driver not connected. Message was not sent." };
  });

  // Push-to-talk: start recording.
  ipcMain.handle("voice-start", async (event) => {
    validateSender(event, trustedWebContentsId);
    sendToDriver({ type: "voice_start" });
    return { success: true };
  });

  // Push-to-talk: stop recording.
  ipcMain.handle("voice-stop", async (event) => {
    validateSender(event, trustedWebContentsId);
    sendToDriver({ type: "voice_stop" });
    return { transcript: "" };
  });

  // Kill switch — halt the agent immediately.
  ipcMain.handle("trigger-kill-switch", async (event) => {
    validateSender(event, trustedWebContentsId);
    sendToDriver({ type: "kill" });
    window.webContents.send("kill-switch");
    return { success: true };
  });

  // Get driver connection status.
  ipcMain.handle("get-driver-status", async (event) => {
    validateSender(event, trustedWebContentsId);
    return { connected: driverConnected };
  });
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••" + key.slice(-4);
}

app.on("before-quit", () => {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (driverSocket) driverSocket.destroy();
  if (storage) storage.close();
});
