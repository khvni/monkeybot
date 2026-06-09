import {
  AppAllowlist,
  ConfirmationGate,
  KillSwitch,
} from "@monkeybot/safety";
import type {
  AppDetector,
  PlannedAction,
  SafetyGateConfig,
  SafetyCheckResult,
} from "./types";
import { Mutex } from "./mutex";

/**
 * Unified safety gate that checks every action against:
 *   1. Kill switch – if triggered, everything is blocked
 *   2. App allowlist – the target app must be approved
 *   3. Confirmation gate – destructive actions need user approval
 *   4. Action-count limit – re-confirm after N unconfirmed actions
 */
export class SafetyGate {
  private killSwitch: KillSwitch;
  private allowlist: AppAllowlist;
  private confirmation: ConfirmationGate;
  private actionsSinceConfirm = 0;
  private maxActionsBeforeConfirm: number;
  private mutex = new Mutex();
  private appDetector?: AppDetector;

  constructor(config: SafetyGateConfig) {
    this.killSwitch = new KillSwitch();
    this.allowlist = new AppAllowlist(config.allowedApps);
    this.confirmation = new ConfirmationGate(config.destructivePatterns);
    this.maxActionsBeforeConfirm = config.maxActionsBeforeConfirm;
    this.appDetector = config.appDetector;
  }

  /** Wire up a listener so external code (Electron, CLI) can trip the switch. */
  onKill(cb: () => void): void {
    this.killSwitch.onKill(cb);
  }

  /** Trigger the kill switch. */
  triggerKillSwitch(): void {
    this.killSwitch.trigger();
  }

  /** Reset the kill switch so the agent can resume. */
  resetKillSwitch(): void {
    this.killSwitch.reset();
    this.actionsSinceConfirm = 0;
  }

  get isKilled(): boolean {
    return this.killSwitch.isTriggered;
  }

  /** Register a UI handler for confirmation dialogs. */
  setConfirmationHandler(
    handler: (
      req: import("@monkeybot/safety").ConfirmationRequest
    ) => Promise<import("@monkeybot/safety").ConfirmationResponse>
  ): void {
    this.confirmation.setHandler(handler);
  }

  /** Add an app to the allowlist. */
  allowApp(appId: string): void {
    this.allowlist.add(appId);
  }

  /** Remove an app from the allowlist. */
  disallowApp(appId: string): void {
    this.allowlist.remove(appId);
  }

  /** Get the list of allowed apps. */
  listAllowedApps(): string[] {
    return this.allowlist.list();
  }

  /**
   * Run all safety checks for a planned action.
   *
   * Serialised via an async mutex so that:
   *   - The actionsSinceConfirm counter stays consistent under concurrent calls.
   *   - Any async app-detection work (native bindings, IPC) cannot starve the
   *     DriverClient because we never hold a synchronous lock across ticks.
   */
  async check(action: PlannedAction): Promise<SafetyCheckResult> {
    return this.mutex.runExclusive(() => this.checkInner(action));
  }

  // -----------------------------------------------------------------------
  // Private – actual safety logic (runs inside mutex)
  // -----------------------------------------------------------------------

  private async checkInner(action: PlannedAction): Promise<SafetyCheckResult> {
    // 1. Kill switch
    if (this.killSwitch.isTriggered) {
      return {
        allowed: false,
        reason: "Kill switch is active — all actions blocked",
        requiresConfirmation: false,
      };
    }

    // 2. Async app detection (non-blocking — awaits instead of sync-blocking)
    const targetApp = this.appDetector
      ? await this.appDetector(action)
      : action.targetApp;

    // 3. App allowlist
    if (targetApp && !this.allowlist.isAllowed(targetApp)) {
      return {
        allowed: false,
        reason: `App "${targetApp}" is not in the allowlist`,
        requiresConfirmation: false,
      };
    }

    // 4. Destructive-action check
    const desc = action.description ?? action.type;
    if (this.confirmation.isDestructive(desc)) {
      const approved = await this.confirmation.requestConfirmation(
        action.type,
        desc,
        "high"
      );
      if (!approved) {
        return {
          allowed: false,
          reason: "User denied confirmation for destructive action",
          requiresConfirmation: true,
        };
      }
      this.actionsSinceConfirm = 0;
      return { allowed: true, requiresConfirmation: true };
    }

    // 5. Action-count limit
    this.actionsSinceConfirm++;
    if (this.actionsSinceConfirm >= this.maxActionsBeforeConfirm) {
      const approved = await this.confirmation.requestConfirmation(
        action.type,
        `Automatic re-confirmation after ${this.maxActionsBeforeConfirm} actions`,
        "low"
      );
      if (!approved) {
        return {
          allowed: false,
          reason: "User denied periodic re-confirmation",
          requiresConfirmation: true,
        };
      }
      this.actionsSinceConfirm = 0;
    }

    return { allowed: true, requiresConfirmation: false };
  }
}
