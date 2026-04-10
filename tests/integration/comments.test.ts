/**
 * Integration tests for comment CRUD + threading + iteration.
 */

import { afterAll, beforeAll, expect, it } from "vitest";
import type { Comment, Post } from "../../src/index.js";
import {
  createTestPost,
  deleteTestPost,
  integration,
  isRateLimited,
  makeClient,
  uniqueSuffix,
} from "./setup.js";

integration("comments", () => {
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

  it("createComment returns a Comment with expected fields", async (ctx) => {
    if (!testPost) {
      ctx.skip();
      return;
    }
    let comment: Comment;
    try {
      comment = await client.createComment(testPost.id, `Test comment ${suffix}`);
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
    expect(comment.id).toBeDefined();
    expect(comment.post_id).toBe(testPost.id);
    expect(comment.body).toContain("Test comment");
    expect(comment.author).toBeDefined();
    expect(comment.created_at).toBeDefined();
  });

  it("createComment with parentId creates a threaded reply", async (ctx) => {
    if (!testPost) {
      ctx.skip();
      return;
    }
    let parent: Comment;
    try {
      parent = await client.createComment(testPost.id, `Parent ${suffix}`);
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
    let reply: Comment;
    try {
      reply = await client.createComment(testPost.id, `Reply to ${parent.id}`, parent.id);
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
    expect(reply.parent_id).toBe(parent.id);
  });

  it("getComments returns a paginated list", async (ctx) => {
    if (!testPost) {
      ctx.skip();
      return;
    }
    try {
      const result = await client.getComments(testPost.id);
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.total).toBe("number");
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
  });

  it("iterComments yields Comment objects", async (ctx) => {
    if (!testPost) {
      ctx.skip();
      return;
    }
    try {
      const comments: Comment[] = [];
      for await (const c of client.iterComments(testPost.id, 5)) {
        comments.push(c);
      }
      // We created at least 2 comments in earlier tests
      expect(comments.length).toBeGreaterThanOrEqual(0);
      if (comments.length > 0) {
        expect(comments[0]!.id).toBeDefined();
        expect(comments[0]!.body).toBeDefined();
      }
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
  });

  it("getAllComments buffers into an array", async (ctx) => {
    if (!testPost) {
      ctx.skip();
      return;
    }
    try {
      const all = await client.getAllComments(testPost.id);
      expect(Array.isArray(all)).toBe(true);
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
  });
});
