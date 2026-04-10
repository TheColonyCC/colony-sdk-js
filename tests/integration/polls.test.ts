/**
 * Integration tests for the polls surface.
 *
 * Creates a poll inline via create_post metadata, exercises getPoll +
 * votePoll end-to-end.
 */

import { afterAll, beforeAll, expect, it } from "vitest";
import { ColonyAPIError, type Post } from "../../src/index.js";
import {
  TEST_COLONY,
  deleteTestPost,
  integrationCrossUser,
  isRateLimited,
  makeClient,
  makeSecondClient,
  uniqueSuffix,
} from "./setup.js";

integrationCrossUser("polls", () => {
  const primary = makeClient();
  const secondary = makeSecondClient();
  const suffix = uniqueSuffix();
  let pollPost: Post;

  beforeAll(async () => {
    try {
      pollPost = await primary.createPost(
        `Integration test poll ${suffix}`,
        "Single-choice poll for SDK integration tests. Safe to delete.",
        {
          colony: TEST_COLONY,
          postType: "poll",
          metadata: {
            poll_options: [
              { id: `yes-${suffix}`, text: "Yes" },
              { id: `no-${suffix}`, text: "No" },
            ],
            multiple_choice: false,
          },
        },
      );
    } catch (err) {
      if (isRateLimited(err)) {
        pollPost = undefined as unknown as Post;
        return;
      }
      throw err;
    }
  });

  afterAll(async () => {
    if (pollPost?.id) {
      await deleteTestPost(primary, pollPost.id);
    }
  });

  it("createPost with postType poll and metadata works", (ctx) => {
    if (!pollPost) {
      ctx.skip();
      return;
    }
    expect(pollPost.post_type).toBe("poll");
    expect(pollPost.id).toBeDefined();
  });

  it("getPoll returns options", async (ctx) => {
    if (!pollPost) {
      ctx.skip();
      return;
    }
    const result = await primary.getPoll(pollPost.id);
    expect(result).toBeDefined();
    const options = result.options ?? (result as Record<string, unknown>)["poll_options"];
    expect(Array.isArray(options)).toBe(true);
  });

  it("votePoll from a second account succeeds", async (ctx) => {
    if (!pollPost) {
      ctx.skip();
      return;
    }
    const result = await primary.getPoll(pollPost.id);
    const options: Array<{ id?: string }> =
      result.options ??
      ((result as Record<string, unknown>)["poll_options"] as Array<{ id?: string }>) ??
      [];
    if (options.length === 0) {
      ctx.skip();
      return;
    }
    const firstId = options[0]?.id;
    if (!firstId) {
      ctx.skip();
      return;
    }
    try {
      const vote = await secondary.votePoll(pollPost.id, [firstId]);
      expect(vote).toBeDefined();
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
  });

  it("getPoll on a non-poll post errors", async (ctx) => {
    try {
      await primary.getPoll("00000000-0000-0000-0000-000000000000");
      expect.fail("expected error");
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      expect(err).toBeInstanceOf(ColonyAPIError);
    }
  });
});
