import { ipcMain, BrowserWindow } from "electron";

/**
 * Register IPC handlers for communication between main and renderer processes.
 */
export function registerIpcHandlers(window: BrowserWindow): void {
  // Onboarding: save API keys.
  ipcMain.handle(
    "save-api-keys",
    async (_event, keys: { openRouter: string; assemblyAi: string; elevenLabs: string }) => {
      // TODO: Persist keys to StorageManager.
      console.log("[IPC] API keys received (stub)");
      return { success: true };
    }
  );

  // Send a text message to the agent.
  ipcMain.handle("send-message", async (_event, message: string) => {
    // TODO: Forward to orchestrator → model router → CUA driver.
    console.log(`[IPC] Message received: ${message} (stub)`);
    return { response: "Acknowledged (stub)" };
  });

  // Push-to-talk: start recording.
  ipcMain.handle("voice-start", async () => {
    // TODO: Start AssemblyAI transcription.
    console.log("[IPC] Voice recording started (stub)");
    return { success: true };
  });

  // Push-to-talk: stop recording.
  ipcMain.handle("voice-stop", async () => {
    // TODO: Stop AssemblyAI transcription and process.
    console.log("[IPC] Voice recording stopped (stub)");
    return { transcript: "" };
  });

  // Kill switch.
  ipcMain.handle("trigger-kill-switch", async () => {
    // TODO: Send kill command to CUA driver via orchestrator.
    console.log("[IPC] Kill switch triggered (stub)");
    window.webContents.send("kill-switch");
    return { success: true };
  });

  // Check onboarding status.
  ipcMain.handle("check-onboarding", async () => {
    // TODO: Check if API keys are configured in StorageManager.
    return { complete: false };
  });
}
