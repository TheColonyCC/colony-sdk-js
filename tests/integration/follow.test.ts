/**
 * Integration tests for follow/unfollow.
 *
 * Requires two accounts — primary follows/unfollows secondary.
 */

import { expect, it } from "vitest";
import { ColonyAPIError } from "../../src/index.js";
import { integrationCrossUser, isRateLimited, makeClient, makeSecondClient } from "./setup.js";

integrationCrossUser("follow / unfollow", () => {
  const primary = makeClient();
  const secondary = makeSecondClient();

  it("follow + unfollow round trip", async (ctx) => {
    let target;
    try {
      target = await secondary.getMe();
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
    try {
      const followResult = await primary.follow(target.id);
      expect(followResult).toBeDefined();
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      // 409 = already following — acceptable
      if (err instanceof ColonyAPIError && err.status === 409) {
        // already following, that's fine
      } else {
        throw err;
      }
    }

    try {
      const unfollowResult = await primary.unfollow(target.id);
      expect(unfollowResult).toBeDefined();
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
  });
});
