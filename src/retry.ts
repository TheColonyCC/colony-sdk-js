/**
 * Configuration for transient-error retries.
 *
 * The SDK retries requests that fail with statuses in {@link RetryConfig.retryOn}
 * using exponential backoff. The 401-then-token-refresh path is **not**
 * governed by this config — token refresh is always attempted exactly
 * once on 401, separately from this retry loop.
 */
export interface RetryConfig {
  /**
   * How many times to retry after the initial attempt.
   * `0` disables retries entirely. The total number of requests
   * is `maxRetries + 1`. Default: `2` (3 total attempts).
   */
  maxRetries: number;
  /**
   * Base delay in seconds. The Nth retry waits
   * `baseDelay * (2 ** (N - 1))` seconds (doubling each time).
   * Default: `1.0`.
   */
  baseDelay: number;
  /**
   * Cap on the per-retry delay in seconds. The exponential
   * backoff is clamped to this value. Default: `10.0`.
   */
  maxDelay: number;
  /**
   * HTTP status codes that trigger a retry. Default:
   * `[429, 502, 503, 504]` — rate limits and transient gateway
   * failures. 5xx are included by default because they almost
   * always represent transient infrastructure issues, not bugs in
   * your request. `500` is intentionally **not** retried by default —
   * it more often indicates a bug in the request than transient infra.
   */
  retryOn: ReadonlySet<number>;
}

/**
 * Build a {@link RetryConfig} with sensible defaults. Pass any field to override.
 *
 * @example
 * ```ts
 * import { ColonyClient, retryConfig } from "@thecolony/sdk";
 *
 * // No retries at all — fail fast
 * const client = new ColonyClient("col_...", { retry: retryConfig({ maxRetries: 0 }) });
 *
 * // Aggressive retries for a flaky network
 * const client = new ColonyClient("col_...", {
 *   retry: retryConfig({ maxRetries: 5, baseDelay: 0.5, maxDelay: 30 }),
 * });
 *
 * // Also retry 500s in addition to the defaults
 * const client = new ColonyClient("col_...", {
 *   retry: retryConfig({ retryOn: new Set([429, 500, 502, 503, 504]) }),
 * });
 * ```
 */
export function retryConfig(overrides: Partial<RetryConfig> = {}): RetryConfig {
  return {
    maxRetries: overrides.maxRetries ?? 2,
    baseDelay: overrides.baseDelay ?? 1.0,
    maxDelay: overrides.maxDelay ?? 10.0,
    retryOn: overrides.retryOn ?? new Set([429, 502, 503, 504]),
  };
}

/** Default singleton — used when no RetryConfig is passed to a client. */
export const DEFAULT_RETRY: RetryConfig = retryConfig();

/**
 * Return `true` if a request that returned `status` should be retried.
 *
 * @param attempt 0-indexed retry counter (`0` means the first attempt has just
 *   failed and we're considering retry #1).
 */
export function shouldRetry(status: number, attempt: number, retry: RetryConfig): boolean {
  return attempt < retry.maxRetries && retry.retryOn.has(status);
}

/**
 * Compute the delay (in seconds) before retry number `attempt + 1`.
 *
 * The server's `Retry-After` header always wins. Otherwise the delay is
 * `baseDelay * 2 ** attempt`, clamped to `maxDelay`.
 */
export function computeRetryDelay(
  attempt: number,
  retry: RetryConfig,
  retryAfterHeader: number | undefined,
): number {
  if (retryAfterHeader !== undefined) {
    return retryAfterHeader;
  }
  return Math.min(retry.baseDelay * Math.pow(2, attempt), retry.maxDelay);
}

/** Sleep for `seconds` seconds. Replaceable in tests. */
export function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}
