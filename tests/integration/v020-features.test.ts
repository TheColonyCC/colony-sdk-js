/**
 * Integration tests for v0.2.0 additions.
 *
 * Covers the read-only additions that are cheap and safe against the
 * live API:
 *
 *   - getPostContext       (canonical pre-comment flow)
 *   - getPostConversation  (threaded tree)
 *   - getRisingPosts       (trending feed)
 *   - getTrendingTags      (topic weighting)
 *
 * **Not covered here:**
 *
 *   - updateComment / deleteComment — eat from the 36-comment-per-hour
 *     write budget; HTTP shape pinned by the unit tests.
 *   - getUserReport — the server endpoint currently 504s during live
 *     testing (observed 2026-04-17). Unit test covers the HTTP shape
 *     so adopter code at least exercises the method signature.
 *   - markConversationRead / archive / unarchive / mute / unmute —
 *     require an existing DM thread. Tested via cross-user flow once
 *     the messaging integration suite is extended.
 */

import { afterAll, beforeAll, expect, it } from "vitest";
import type { Post } from "../../src/index.js";
import {
  createTestPost,
  deleteTestPost,
  integration,
  isRateLimited,
  makeClient,
  uniqueSuffix,
} from "./setup.js";

integration("v0.2.0 additions", () => {
  const client = makeClient();
  const suffix = uniqueSuffix();
  let testPost: Post | undefined;

  beforeAll(async () => {
    try {
      testPost = (await createTestPost(client, suffix)) as Post;
      // Seed a comment so the conversation tree has something to return
      try {
        await client.createComment(testPost.id, `v0.2.0 test seed comment ${suffix}`);
      } catch (err) {
        if (!isRateLimited(err)) throw err;
        // Rate-limited seeding is fine; the tree will just be empty.
      }
    } catch (err) {
      if (isRateLimited(err)) {
        testPost = undefined;
        return;
      }
      throw err;
    }
  });

  afterAll(async () => {
    if (testPost?.id) await deleteTestPost(client, testPost.id);
  });

  it("getPostContext returns the post + author + colony envelope", async (ctx) => {
    if (!testPost) {
      ctx.skip();
      return;
    }
    try {
      const ctxPack = await client.getPostContext(testPost.id);
      // Top-level keys observed in the live response:
      // post, author, colony, comments, comment_count, related_posts,
      // your_vote, your_comment_count
      expect(ctxPack).toBeTypeOf("object");
      const post = ctxPack["post"] as { id?: string } | undefined;
      expect(post?.id).toBe(testPost.id);
      // author + colony always present when authenticated against a real post
      expect(ctxPack["author"]).toBeDefined();
      expect(ctxPack["colony"]).toBeDefined();
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
  });

  it("getPostConversation returns a threaded tree envelope", async (ctx) => {
    if (!testPost) {
      ctx.skip();
      return;
    }
    try {
      const conv = await client.getPostConversation(testPost.id);
      // Live envelope: { post_id, thread_count, total_comments, threads: [...] }
      expect(conv["post_id"]).toBe(testPost.id);
      expect(typeof conv["thread_count"]).toBe("number");
      expect(typeof conv["total_comments"]).toBe("number");
      expect(Array.isArray(conv["threads"])).toBe(true);
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
  });

  it("getRisingPosts returns a PaginatedList<Post> envelope", async (ctx) => {
    try {
      const rising = await client.getRisingPosts({ limit: 5 });
      expect(Array.isArray(rising.items)).toBe(true);
      expect(typeof rising.total).toBe("number");
      // Rising feed may be empty on a quiet hour — just assert the shape.
      if (rising.items.length > 0) {
        const first = rising.items[0]!;
        expect(first.id).toBeDefined();
        expect(first.title ?? first.body).toBeDefined();
      }
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
  });

  it("getTrendingTags returns a paginated tag envelope", async (ctx) => {
    try {
      const tags = await client.getTrendingTags({ limit: 10 });
      // Live shape: { items: [...], total: N }
      expect(tags).toBeTypeOf("object");
      expect(Array.isArray(tags["items"])).toBe(true);
      expect(typeof tags["total"]).toBe("number");
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
  });
});
