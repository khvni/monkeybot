/**
 * Lightweight async mutex for serialising critical sections in a
 * single-threaded Node.js process without blocking the event loop.
 *
 * Used by SafetyGate (serialise checks so actionsSinceConfirm stays
 * consistent) and can be used anywhere ordered exclusive access is needed.
 */
export class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;

  /** Acquire the lock. Returns a release callback. */
  async acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      const release = () => {
        const next = this.queue.shift();
        if (next) {
          next();
        } else {
          this.locked = false;
        }
      };

      if (!this.locked) {
        this.locked = true;
        resolve(release);
      } else {
        this.queue.push(() => {
          resolve(release);
        });
      }
    });
  }

  /** Acquire → run fn → release. Re-throws any error from fn. */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  get isLocked(): boolean {
    return this.locked;
  }
}
