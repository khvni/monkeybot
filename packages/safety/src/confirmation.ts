import { randomUUID } from "node:crypto";
import type { ConfirmationRequest, ConfirmationResponse } from "./types";

export type ConfirmationHandler = (
  request: ConfirmationRequest
) => Promise<ConfirmationResponse>;

/**
 * Gate that intercepts destructive actions and requires user confirmation.
 * The Electron frontend registers a handler to show confirmation dialogs.
 */
export class ConfirmationGate {
  private handler: ConfirmationHandler | null = null;
  private destructivePatterns: RegExp[] = [];

  constructor(patterns: string[] = []) {
    this.destructivePatterns = patterns.map((p) => new RegExp(p, "i"));
  }

  /** Register the UI handler that presents confirmation dialogs. */
  setHandler(handler: ConfirmationHandler): void {
    this.handler = handler;
  }

  /** Check if an action description matches a destructive pattern. */
  isDestructive(actionDescription: string): boolean {
    return this.destructivePatterns.some((p) => p.test(actionDescription));
  }

  /**
   * Request confirmation for a destructive action.
   * Returns true if approved, false if denied or no handler is registered.
   */
  async requestConfirmation(
    action: string,
    description: string,
    riskLevel: ConfirmationRequest["riskLevel"] = "medium"
  ): Promise<boolean> {
    if (!this.handler) {
      console.warn("[Safety] No confirmation handler registered, denying.");
      return false;
    }

    const request: ConfirmationRequest = {
      id: randomUUID(),
      action,
      description,
      riskLevel,
      timestamp: Date.now(),
    };

    const response = await this.handler(request);
    return response.approved;
  }
}
