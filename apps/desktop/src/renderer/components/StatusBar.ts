/**
 * Connection status bar — shows the Rust CUA driver connection state.
 */
export function createStatusBar(): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "status-bar";

  const statusIndicator = document.createElement("span");
  statusIndicator.className = "status-indicator";
  statusIndicator.innerHTML = `<span class="status-dot disconnected"></span><span class="status-label">Driver: disconnected</span>`;

  const version = document.createElement("span");
  version.className = "status-version";
  version.textContent = "monkeybot v0.1.0";

  bar.appendChild(statusIndicator);
  bar.appendChild(version);

  // Get initial status
  window.monkeybot.getDriverStatus().then(({ connected }) => {
    updateStatus(connected);
  });

  // Listen for status changes
  window.monkeybot.onDriverStatus((connected) => {
    updateStatus(connected);
  });

  function updateStatus(connected: boolean): void {
    const dot = statusIndicator.querySelector(".status-dot") as HTMLElement;
    const label = statusIndicator.querySelector(".status-label") as HTMLElement;

    if (connected) {
      dot.className = "status-dot connected";
      label.textContent = "Driver: connected";
    } else {
      dot.className = "status-dot disconnected";
      label.textContent = "Driver: disconnected";
    }
  }

  return bar;
}
