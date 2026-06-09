import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload script — exposes a safe API to the renderer process.
 */
contextBridge.exposeInMainWorld("monkeybot", {
  // Onboarding
  saveApiKeys: (keys: {
    openRouter: string;
    assemblyAi: string;
    elevenLabs: string;
  }) => ipcRenderer.invoke("save-api-keys", keys),

  checkOnboarding: () => ipcRenderer.invoke("check-onboarding"),

  getApiKeys: () => ipcRenderer.invoke("get-api-keys"),

  // Messaging
  sendMessage: (message: string) => ipcRenderer.invoke("send-message", message),

  // Voice
  voiceStart: () => ipcRenderer.invoke("voice-start"),
  voiceStop: () => ipcRenderer.invoke("voice-stop"),

  // Safety
  triggerKillSwitch: () => ipcRenderer.invoke("trigger-kill-switch"),

  // Driver status
  getDriverStatus: () => ipcRenderer.invoke("get-driver-status"),

  // Events from main process
  onDriverStatus: (cb: (connected: boolean) => void) => {
    ipcRenderer.on("driver-status", (_e, connected) => cb(connected));
  },
  onWatchMeToggle: (cb: (active: boolean) => void) => {
    ipcRenderer.on("watch-me-toggle", (_e, active) => cb(active));
  },
  onKillSwitch: (cb: () => void) => {
    ipcRenderer.on("kill-switch", () => cb());
  },
});
