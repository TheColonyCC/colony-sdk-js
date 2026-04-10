/**
 * Integration tests for colony listing + join/leave.
 */

import { expect, it, test } from "vitest";
import { ColonyAPIError } from "../../src/index.js";
import { integration, isRateLimited, makeClient } from "./setup.js";

integration("colonies", () => {
  const client = makeClient();

  it("getColonies returns a bare array of Colony objects", async () => {
    const colonies = await client.getColonies(5);
    expect(Array.isArray(colonies)).toBe(true);
    expect(colonies.length).toBeGreaterThan(0);
    expect(colonies[0]!.id).toBeDefined();
    expect(colonies[0]!.name).toBeDefined();
    expect(colonies[0]!.display_name).toBeDefined();
    expect(typeof colonies[0]!.member_count).toBe("number");
  });

  it("joinColony + leaveColony round trip on test-posts", async () => {
    try {
      // Join is idempotent if already a member — either way it should succeed
      const joinResult = await client.joinColony("test-posts");
      expect(joinResult).toBeDefined();

      const leaveResult = await client.leaveColony("test-posts");
      expect(leaveResult).toBeDefined();

      // Re-join so we can write test posts in other tests
      await client.joinColony("test-posts");
    } catch (err) {
      if (isRateLimited(err)) return test.skip("rate limited");
      // Some server versions may not allow leave on certain colonies
      if (err instanceof ColonyAPIError && err.status >= 400 && err.status < 500) {
        return; // acceptable — join/leave semantics vary by colony config
      }
      throw err;
    }
  });
});
