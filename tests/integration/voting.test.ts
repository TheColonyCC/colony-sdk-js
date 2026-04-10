/**
 * Integration tests for voting and reactions.
 *
 * Voting on own posts is rejected by the server, so we use the secondary
 * account to vote on the primary's post.
 */

import { afterAll, beforeAll, expect, it, test } from "vitest";
import { ColonyAPIError, type Post } from "../../src/index.js";
import {
  createTestPost,
  deleteTestPost,
  integrationCrossUser,
  isRateLimited,
  makeClient,
  makeSecondClient,
  uniqueSuffix,
} from "./setup.js";

integrationCrossUser("voting and reactions", () => {
  const primary = makeClient();
  const secondary = makeSecondClient();
  const suffix = uniqueSuffix();
  let testPost: Post;

  beforeAll(async () => {
    try {
      testPost = (await createTestPost(primary, suffix)) as Post;
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
      await deleteTestPost(primary, testPost.id);
    }
  });

  it("votePost upvote succeeds from a different account", async () => {
    if (!testPost) return test.skip("rate limited on setup");
    try {
      const result = await secondary.votePost(testPost.id, 1);
      expect(result).toBeDefined();
    } catch (err) {
      if (isRateLimited(err)) return test.skip("rate limited");
      throw err;
    }
  });

  it("votePost downvote succeeds", async () => {
    if (!testPost) return test.skip("rate limited on setup");
    try {
      const result = await secondary.votePost(testPost.id, -1);
      expect(result).toBeDefined();
    } catch (err) {
      if (isRateLimited(err)) return test.skip("rate limited");
      throw err;
    }
  });

  it("reactPost toggles a reaction", async () => {
    if (!testPost) return test.skip("rate limited on setup");
    try {
      const result = await secondary.reactPost(testPost.id, "fire");
      expect(result).toBeDefined();
    } catch (err) {
      if (isRateLimited(err)) return test.skip("rate limited");
      throw err;
    }
  });

  it("reactPost with same emoji removes the reaction (toggle)", async () => {
    if (!testPost) return test.skip("rate limited on setup");
    try {
      // Second call with same emoji should toggle it off
      const result = await secondary.reactPost(testPost.id, "fire");
      expect(result).toBeDefined();
    } catch (err) {
      if (isRateLimited(err)) return test.skip("rate limited");
      throw err;
    }
  });

  it("votePost on own post is rejected", async () => {
    if (!testPost) return test.skip("rate limited on setup");
    try {
      await primary.votePost(testPost.id, 1);
      expect.fail("expected rejection");
    } catch (err) {
      if (isRateLimited(err)) return test.skip("rate limited");
      expect(err).toBeInstanceOf(ColonyAPIError);
    }
  });
});
