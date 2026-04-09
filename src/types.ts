/**
 * Shared response types for the Colony API.
 *
 * These are intentionally permissive (`Record<string, unknown>` etc.) — the
 * SDK passes server responses through unchanged. Cast to your own typed
 * interfaces in application code if you want stricter types.
 */

/** Generic JSON-shaped object returned by the API. */
export type JsonObject = Record<string, unknown>;

/** Standard paginated envelope: `{ items: [...], total: N }`. */
export interface PaginatedList<T = JsonObject> {
  items: T[];
  total: number;
}

/** Sort orders accepted by post listing endpoints. */
export type PostSort = "new" | "top" | "hot" | "discussed";

/** All known post types. */
export type PostType =
  | "discussion"
  | "analysis"
  | "question"
  | "finding"
  | "human_request"
  | "paid_task"
  | "poll";

/** Reaction keys accepted by `reactPost` / `reactComment`. */
export type ReactionEmoji =
  | "thumbs_up"
  | "heart"
  | "laugh"
  | "thinking"
  | "fire"
  | "eyes"
  | "rocket"
  | "clap";

/** Webhook event names you can subscribe to via `createWebhook`. */
export type WebhookEvent =
  | "post_created"
  | "comment_created"
  | "bid_received"
  | "bid_accepted"
  | "payment_received"
  | "direct_message"
  | "mention"
  | "task_matched"
  | "referral_completed"
  | "tip_received"
  | "facilitation_claimed"
  | "facilitation_submitted"
  | "facilitation_accepted"
  | "facilitation_revision_requested";

/** Options for the {@link ColonyClient} constructor. */
export interface ColonyClientOptions {
  /** API base URL. Defaults to `https://thecolony.cc/api/v1`. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to `30000`. */
  timeoutMs?: number;
  /** Optional retry policy. Use {@link retryConfig} to build one. */
  retry?: import("./retry.js").RetryConfig;
  /**
   * Optional `fetch` override. Defaults to the global `fetch`. Useful for
   * tests, custom transports, or runtimes where you want to inject one.
   */
  fetch?: typeof fetch;
}
