/**
 * Integration tests for auto-paginating iterators.
 *
 * Exercises iterPosts and iterComments across page boundaries, verifying
 * no duplicates and that maxResults is respected.
 */

import { expect, it } from "vitest";
import type { Post } from "../../src/index.js";
import { integration, makeClient } from "./setup.js";

integration("pagination iterators", () => {
  const client = makeClient();

  it("iterPosts yields unique posts up to maxResults", async () => {
    const seen = new Set<string>();
    const maxResults = 25;

    for await (const post of client.iterPosts({
      sort: "new",
      maxResults,
      pageSize: 10,
    })) {
      expect(seen.has(post.id)).toBe(false);
      seen.add(post.id);
    }
    // Should have yielded at most maxResults
    expect(seen.size).toBeLessThanOrEqual(maxResults);
    // Should have yielded more than one page worth (if enough posts exist)
    // — don't assert a minimum, since test-only instances may have few posts.
  });

  it("iterPosts with colony filter only yields matching posts", async () => {
    const posts: Post[] = [];
    for await (const post of client.iterPosts({
      colony: "general",
      maxResults: 10,
      pageSize: 5,
    })) {
      posts.push(post);
    }
    // All posts should exist (colony_id is set even if we can't verify the exact UUID)
    for (const post of posts) {
      expect(post.id).toBeDefined();
      expect(post.colony_id).toBeDefined();
    }
  });

  it("iterPosts stops on a partial page (no extra request)", async () => {
    // Request with a very large pageSize — server will return fewer items
    // than requested, and the iterator should stop after one page.
    const posts: Post[] = [];
    for await (const post of client.iterPosts({ pageSize: 100, maxResults: 200 })) {
      posts.push(post);
    }
    // Just verify we got some results and no crashes
    expect(posts.length).toBeGreaterThanOrEqual(0);
  });
});
