import {
  AppAllowlist,
  ConfirmationGate,
  KillSwitch,
} from "@monkeybot/safety";
import type {
  PlannedAction,
  SafetyGateConfig,
  SafetyCheckResult,
} from "./types";

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

  constructor(config: SafetyGateConfig) {
    this.killSwitch = new KillSwitch();
    this.allowlist = new AppAllowlist(config.allowedApps);
    this.confirmation = new ConfirmationGate(config.destructivePatterns);
    this.maxActionsBeforeConfirm = config.maxActionsBeforeConfirm;
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
   * Returns `{ allowed, reason, requiresConfirmation }`.
   * If `requiresConfirmation` is true the caller must present the confirmation
   * dialog before proceeding.
   */
  async check(action: PlannedAction): Promise<SafetyCheckResult> {
    // 1. Kill switch
    if (this.killSwitch.isTriggered) {
      return {
        allowed: false,
        reason: "Kill switch is active — all actions blocked",
        requiresConfirmation: false,
      };
    }

    // 2. App allowlist
    if (action.targetApp && !this.allowlist.isAllowed(action.targetApp)) {
      return {
        allowed: false,
        reason: `App "${action.targetApp}" is not in the allowlist`,
        requiresConfirmation: false,
      };
    }

    // 3. Destructive-action check
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

    // 4. Action-count limit
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
