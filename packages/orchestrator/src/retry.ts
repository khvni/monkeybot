/** Configuration for retry behaviour. */
export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrors?: string[];
}

const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 15_000,
  backoffFactor: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute `fn` with exponential back-off retry.
 *
 * An error is considered retryable if:
 *   - `retryableErrors` is not provided (all errors are retried), or
 *   - The error message or code contains any of the `retryableErrors` strings.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === opts.maxAttempts) break;
      if (!isRetryable(lastError, opts.retryableErrors)) break;

      const jitter = Math.random() * 200;
      const delay = Math.min(
        opts.baseDelay * Math.pow(opts.backoffFactor, attempt - 1) + jitter,
        opts.maxDelay
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

function isRetryable(
  err: Error,
  retryableErrors: string[] | undefined
): boolean {
  if (!retryableErrors || retryableErrors.length === 0) return true;

  const msg = err.message.toLowerCase();
  const code = (err as NodeJS.ErrnoException).code?.toLowerCase() ?? "";

  return retryableErrors.some(
    (token) =>
      msg.includes(token.toLowerCase()) || code.includes(token.toLowerCase())
  );
}
