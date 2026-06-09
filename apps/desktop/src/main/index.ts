import { app, Tray, BrowserWindow, ipcMain, nativeImage } from "electron";
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
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In production, load the bundled HTML. For now, load the dev file.
  win.loadFile(path.join(__dirname, "../renderer/index.html"));

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
