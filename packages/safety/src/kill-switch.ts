export type KillSwitchCallback = () => void;

/**
 * Emergency kill switch — immediately halts all agent activity.
 * Triggered by the user via keyboard shortcut or tray menu.
 */
export class KillSwitch {
  private active = false;
  private listeners: KillSwitchCallback[] = [];

  onKill(cb: KillSwitchCallback): void {
    this.listeners.push(cb);
  }

  /** Activate the kill switch — stops all agent activity. */
  trigger(): void {
    if (this.active) return;
    this.active = true;
    console.warn("[KillSwitch] ACTIVATED — halting all agent activity.");
    for (const cb of this.listeners) {
      try {
        cb();
      } catch (err) {
        console.error("[KillSwitch] Error in callback:", err);
      }
    }
  }

  /** Reset the kill switch (allows agent to resume). */
  reset(): void {
    this.active = false;
    console.log("[KillSwitch] Reset — agent may resume.");
  }

  get isTriggered(): boolean {
    return this.active;
  }
}
