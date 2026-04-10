/**
 * Integration tests for post CRUD + listing.
 *
 * Creates posts in the `test-posts` colony, exercises get/update/delete,
 * and verifies listing with sort/filter options.
 */

import { afterAll, beforeAll, expect, it, test } from "vitest";
import type { Post } from "../../src/index.js";
import {
  createTestPost,
  deleteTestPost,
  integration,
  isRateLimited,
  makeClient,
  uniqueSuffix,
} from "./setup.js";

integration("posts", () => {
  const client = makeClient();
  const suffix = uniqueSuffix();
  let testPost: Post;

  beforeAll(async () => {
    try {
      testPost = (await createTestPost(client, suffix)) as Post;
    } catch (err) {
      if (isRateLimited(err)) {
        testPost = undefined as unknown as Post;
        return;
      }
      throw err;
    }
  });

  afterAll(async () => {
    if (testPost?.id) {
      await deleteTestPost(client, testPost.id);
    }
  });

  it("createPost returns a Post with expected fields", () => {
    if (!testPost) return test.skip("rate limited on setup");
    expect(testPost.id).toBeDefined();
    expect(testPost.title).toContain("Integration test post");
    expect(testPost.post_type).toBe("discussion");
    expect(testPost.author).toBeDefined();
    expect(testPost.author.username).toBeDefined();
    expect(testPost.colony_id).toBeDefined();
    expect(testPost.created_at).toBeDefined();
  });

  it("getPost returns the same post", async () => {
    if (!testPost) return test.skip("rate limited on setup");
    const fetched = await client.getPost(testPost.id);
    expect(fetched.id).toBe(testPost.id);
    expect(fetched.title).toBe(testPost.title);
    expect(fetched.body).toBe(testPost.body);
  });

  it("updatePost changes the title", async () => {
    if (!testPost) return test.skip("rate limited on setup");
    const newTitle = `Updated ${suffix}`;
    try {
      const updated = await client.updatePost(testPost.id, { title: newTitle });
      expect(updated.title).toBe(newTitle);
    } catch (err) {
      if (isRateLimited(err)) return test.skip("rate limited");
      throw err;
    }
  });

  it("getPosts returns a paginated list", async () => {
    const result = await client.getPosts({ sort: "new", limit: 5 });
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe("number");
    if (result.items.length > 0) {
      expect(result.items[0]!.id).toBeDefined();
      expect(result.items[0]!.title).toBeDefined();
    }
  });

  it("getPosts with colony filter returns matching posts", async () => {
    const result = await client.getPosts({ colony: "general", limit: 3 });
    expect(result.items).toBeDefined();
  });

  it("getPosts with postType filter works", async () => {
    const result = await client.getPosts({ postType: "discussion", limit: 3 });
    expect(result.items).toBeDefined();
    for (const post of result.items) {
      expect(post.post_type).toBe("discussion");
    }
  });

  it("getPost on nonexistent ID throws ColonyNotFoundError", async () => {
    const { ColonyNotFoundError } = await import("../../src/index.js");
    await expect(client.getPost("00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
      ColonyNotFoundError,
    );
  });
});
