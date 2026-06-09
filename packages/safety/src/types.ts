/** Safety policy configuration. */
export interface SafetyPolicy {
  /** Whether user-initiated recording ("watch me") mode is active. */
  watchMeMode: boolean;
  /** Maximum actions before requiring re-confirmation. */
  maxActionsBeforeConfirm: number;
  /** App IDs allowed for agent interaction. */
  allowedApps: string[];
  /** Action patterns considered destructive (require confirmation). */
  destructivePatterns: string[];
}

/** A request sent to the user for confirmation before a destructive action. */
export interface ConfirmationRequest {
  id: string;
  action: string;
  description: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  timestamp: number;
}

/** User response to a confirmation request. */
export interface ConfirmationResponse {
  requestId: string;
  approved: boolean;
  timestamp: number;
}
