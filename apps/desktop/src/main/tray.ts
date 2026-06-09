import { Tray, Menu, nativeImage, BrowserWindow, screen } from "electron";
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

  // Resolve the monitor that contains the tray icon.
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y,
  });
  const workArea = display.workArea;

  // Center the window horizontally on the tray icon.
  let x = Math.round(
    trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2
  );

  // Determine whether the tray sits at the top (macOS) or bottom
  // (Windows/Linux taskbar) of the screen and position accordingly.
  const trayCenter = trayBounds.y + trayBounds.height / 2;
  const screenMiddle = display.bounds.y + display.bounds.height / 2;

  let y: number;
  if (trayCenter < screenMiddle) {
    // Tray at top — drop window below it.
    y = Math.round(trayBounds.y + trayBounds.height);
  } else {
    // Tray at bottom — show window above it.
    y = Math.round(trayBounds.y - windowBounds.height);
  }

  // Clamp to the work area so the window never overflows off-screen.
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - windowBounds.width));
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - windowBounds.height));

  window.setPosition(x, y, false);
  window.show();
  window.focus();
}
