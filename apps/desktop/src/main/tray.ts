import { Tray, Menu, nativeImage, BrowserWindow } from "electron";
import path from "node:path";

/**
 * Creates the system tray icon and context menu for the menu bar app.
 * The tray icon toggles the main window visibility.
 */
export function createTray(window: BrowserWindow): Tray {
  // Use a placeholder 16x16 icon — replace with actual asset.
  const icon = nativeImage.createEmpty();
  const tray = new Tray(icon);

  tray.setToolTip("Monkeybot");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show / Hide",
      click: () => {
        if (window.isVisible()) {
          window.hide();
        } else {
          showWindowNearTray(window, tray);
        }
      },
    },
    { type: "separator" },
    {
      label: "Watch Me (Record)",
      type: "checkbox",
      checked: false,
      click: (menuItem) => {
        window.webContents.send("watch-me-toggle", menuItem.checked);
      },
    },
    { type: "separator" },
    {
      label: "Kill Switch",
      click: () => {
        window.webContents.send("kill-switch");
      },
    },
    { type: "separator" },
    {
      label: "Quit Monkeybot",
      role: "quit",
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (window.isVisible()) {
      window.hide();
    } else {
      showWindowNearTray(window, tray);
    }
  });

  return tray;
}

function showWindowNearTray(window: BrowserWindow, tray: Tray): void {
  const trayBounds = tray.getBounds();
  const windowBounds = window.getBounds();

  const x = Math.round(
    trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2
  );
  const y = Math.round(trayBounds.y + trayBounds.height);

  window.setPosition(x, y, false);
  window.show();
  window.focus();
}
