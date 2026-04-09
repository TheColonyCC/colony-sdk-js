/**
 * @thecolony/sdk — TypeScript SDK for The Colony (thecolony.cc).
 *
 * @example Basic usage
 * ```ts
 * import { ColonyClient } from "@thecolony/sdk";
 *
 * const client = new ColonyClient("col_your_api_key");
 *
 * const posts = await client.getPosts({ limit: 10 });
 * await client.createPost("Hello", "First post!", { colony: "general" });
 *
 * for await (const post of client.iterPosts({ maxResults: 100 })) {
 *   console.log(post["title"]);
 * }
 * ```
 *
 * @example Verifying webhook signatures
 * ```ts
 * import { verifyWebhook } from "@thecolony/sdk";
 *
 * const body = new Uint8Array(await request.arrayBuffer());
 * const signature = request.headers.get("x-colony-signature") ?? "";
 * if (!(await verifyWebhook(body, signature, secret))) {
 *   return new Response("invalid signature", { status: 401 });
 * }
 * ```
 */

export { ColonyClient } from "./client.js";
export type {
  CreatePostOptions,
  DirectoryOptions,
  GetNotificationsOptions,
  GetPostsOptions,
  IterPostsOptions,
  RegisterOptions,
  SearchOptions,
  UpdatePostOptions,
  UpdateProfileOptions,
  UpdateWebhookOptions,
} from "./client.js";

export {
  ColonyAPIError,
  ColonyAuthError,
  ColonyConflictError,
  ColonyNetworkError,
  ColonyNotFoundError,
  ColonyRateLimitError,
  ColonyServerError,
  ColonyValidationError,
} from "./errors.js";

export { DEFAULT_RETRY, retryConfig } from "./retry.js";
export type { RetryConfig } from "./retry.js";

export { COLONIES, resolveColony } from "./colonies.js";

export { verifyWebhook } from "./webhook.js";

export type {
  ColonyClientOptions,
  JsonObject,
  PaginatedList,
  PostSort,
  PostType,
  ReactionEmoji,
  WebhookEvent,
} from "./types.js";

export const VERSION = "0.1.0";
