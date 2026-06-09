import { ipcMain, BrowserWindow, app } from "electron";
import path from "node:path";
import { StorageManager } from "@monkeybot/storage";
import net from "node:net";

const DB_PATH = path.join(app.getPath("userData"), "monkeybot.db");
let storage: StorageManager | null = null;

function getStorage(): StorageManager {
  if (!storage) {
    storage = new StorageManager(DB_PATH);
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
  // Attempt initial connection to the CUA driver.
  connectToDriver(window);

  // Onboarding: save API keys to SQLite.
  ipcMain.handle(
    "save-api-keys",
    async (
      _event,
      keys: { openRouter: string; assemblyAi: string; elevenLabs: string }
    ) => {
      try {
        const db = getStorage();
        db.setApiKey("openrouter", keys.openRouter);
        if (keys.assemblyAi) db.setApiKey("assemblyai", keys.assemblyAi);
        if (keys.elevenLabs) db.setApiKey("elevenlabs", keys.elevenLabs);
        return { success: true };
      } catch (err) {
        console.error("[IPC] Failed to save API keys:", err);
        return { success: false };
      }
    }
  );

  // Check if onboarding is complete (OpenRouter key must exist).
  ipcMain.handle("check-onboarding", async () => {
    try {
      const db = getStorage();
      const key = db.getApiKey("openrouter");
      return { complete: !!key };
    } catch {
      return { complete: false };
    }
  });

  // Get saved API keys (masked for display).
  ipcMain.handle("get-api-keys", async () => {
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
  ipcMain.handle("send-message", async (_event, message: string) => {
    const sent = sendToDriver({ type: "user_message", content: message });
    if (sent) {
      return { response: "Message sent to agent." };
    }
    return { response: "Driver not connected. Message was not sent." };
  });

  // Push-to-talk: start recording.
  ipcMain.handle("voice-start", async () => {
    sendToDriver({ type: "voice_start" });
    return { success: true };
  });

  // Push-to-talk: stop recording.
  ipcMain.handle("voice-stop", async () => {
    sendToDriver({ type: "voice_stop" });
    return { transcript: "" };
  });

  // Kill switch — halt the agent immediately.
  ipcMain.handle("trigger-kill-switch", async () => {
    sendToDriver({ type: "kill" });
    window.webContents.send("kill-switch");
    return { success: true };
  });

  // Get driver connection status.
  ipcMain.handle("get-driver-status", async () => {
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
