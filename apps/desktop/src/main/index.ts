import { app, Tray, BrowserWindow } from "electron";
import path from "node:path";
import { createTray } from "./tray";
import { registerIpcHandlers } from "./ipc";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 400,
    height: 600,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    transparent: false,
    hasShadow: true,
    vibrancy: "under-window",
    visualEffectState: "active",
    backgroundColor: "#1c1c1e",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "../renderer/index.html"));

  // Hide window when focus is lost (menu bar app pattern).
  win.on("blur", () => {
    if (!win.webContents.isDevToolsOpened()) {
      win.hide();
    }
  });

  return win;
}

app.whenReady().then(() => {
  mainWindow = createWindow();
  tray = createTray(mainWindow);
  registerIpcHandlers(mainWindow);

  // Hide dock icon (menu bar app pattern).
  if (process.platform === "darwin") {
    app.dock?.hide();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

export { mainWindow, tray };
