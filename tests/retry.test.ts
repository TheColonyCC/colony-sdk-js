import { describe, expect, it } from "vitest";

import { DEFAULT_RETRY, computeRetryDelay, retryConfig, shouldRetry } from "../src/retry.js";

describe("retryConfig", () => {
  it("returns sensible defaults", () => {
    const cfg = retryConfig();
    expect(cfg.maxRetries).toBe(2);
    expect(cfg.baseDelay).toBe(1.0);
    expect(cfg.maxDelay).toBe(10.0);
    expect(cfg.retryOn.has(429)).toBe(true);
    expect(cfg.retryOn.has(502)).toBe(true);
    expect(cfg.retryOn.has(503)).toBe(true);
    expect(cfg.retryOn.has(504)).toBe(true);
    expect(cfg.retryOn.has(500)).toBe(false);
  });

  it("supports overriding individual fields", () => {
    const cfg = retryConfig({ maxRetries: 5, baseDelay: 0.5, maxDelay: 30 });
    expect(cfg.maxRetries).toBe(5);
    expect(cfg.baseDelay).toBe(0.5);
    expect(cfg.maxDelay).toBe(30);
    // unspecified field still defaulted
    expect(cfg.retryOn.has(429)).toBe(true);
  });

  it("supports custom retryOn set", () => {
    const cfg = retryConfig({ retryOn: new Set([429, 500]) });
    expect(cfg.retryOn.has(500)).toBe(true);
    expect(cfg.retryOn.has(502)).toBe(false);
  });

  it("DEFAULT_RETRY matches retryConfig() defaults", () => {
    expect(DEFAULT_RETRY.maxRetries).toBe(2);
    expect(DEFAULT_RETRY.retryOn.has(429)).toBe(true);
  });
});

describe("shouldRetry", () => {
  const cfg = retryConfig();

  it("retries 429 within budget", () => {
    expect(shouldRetry(429, 0, cfg)).toBe(true);
    expect(shouldRetry(429, 1, cfg)).toBe(true);
  });

  it("stops retrying once budget is exhausted", () => {
    expect(shouldRetry(429, 2, cfg)).toBe(false);
  });

  it("does not retry 200 or 4xx (except 429)", () => {
    expect(shouldRetry(200, 0, cfg)).toBe(false);
    expect(shouldRetry(404, 0, cfg)).toBe(false);
    expect(shouldRetry(401, 0, cfg)).toBe(false);
  });

  it("does not retry 500 by default", () => {
    expect(shouldRetry(500, 0, cfg)).toBe(false);
  });

  it("retries 502, 503, 504", () => {
    expect(shouldRetry(502, 0, cfg)).toBe(true);
    expect(shouldRetry(503, 0, cfg)).toBe(true);
    expect(shouldRetry(504, 0, cfg)).toBe(true);
  });

  it("disables retries when maxRetries=0", () => {
    const noRetry = retryConfig({ maxRetries: 0 });
    expect(shouldRetry(429, 0, noRetry)).toBe(false);
  });
});

describe("computeRetryDelay", () => {
  const cfg = retryConfig();

  it("doubles each attempt", () => {
    expect(computeRetryDelay(0, cfg, undefined)).toBe(1);
    expect(computeRetryDelay(1, cfg, undefined)).toBe(2);
    expect(computeRetryDelay(2, cfg, undefined)).toBe(4);
  });

  it("clamps to maxDelay", () => {
    expect(computeRetryDelay(10, cfg, undefined)).toBe(10);
  });

  it("Retry-After header overrides computed delay", () => {
    expect(computeRetryDelay(0, cfg, 7)).toBe(7);
    expect(computeRetryDelay(5, cfg, 1)).toBe(1);
  });
});
