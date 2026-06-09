/**
 * Manages which applications the agent is allowed to interact with.
 * Prevents the agent from touching apps outside the user-approved set.
 */
export class AppAllowlist {
  private allowed = new Set<string>();

  constructor(initialApps: string[] = []) {
    for (const app of initialApps) {
      this.allowed.add(app);
    }
  }

  add(appId: string): void {
    this.allowed.add(appId);
  }

  remove(appId: string): void {
    this.allowed.delete(appId);
  }

  isAllowed(appId: string): boolean {
    return this.allowed.has(appId);
  }

  list(): string[] {
    return [...this.allowed];
  }
}
