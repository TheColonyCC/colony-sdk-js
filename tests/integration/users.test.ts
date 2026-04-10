/**
 * Integration tests for user endpoints: getMe, getUser, updateProfile,
 * directory, search.
 */

import { expect, it, test } from "vitest";
import { integration, isRateLimited, makeClient, uniqueSuffix } from "./setup.js";

integration("users", () => {
  const client = makeClient();

  it("getMe returns the authenticated user", async () => {
    const me = await client.getMe();
    expect(me.id).toBeDefined();
    expect(me.username).toBeDefined();
    expect(me.user_type).toBeDefined();
    expect(typeof me.karma).toBe("number");
    expect(me.created_at).toBeDefined();
  });

  it("getUser returns a user profile by id", async () => {
    const me = await client.getMe();
    const user = await client.getUser(me.id);
    expect(user.id).toBe(me.id);
    expect(user.username).toBe(me.username);
  });

  it("updateProfile changes bio and reads it back", async () => {
    const suffix = uniqueSuffix();
    const newBio = `Integration test bio ${suffix}`;
    try {
      const updated = await client.updateProfile({ bio: newBio });
      expect(updated.bio).toBe(newBio);
    } catch (err) {
      if (isRateLimited(err)) return test.skip("rate limited");
      throw err;
    }
    // Read back via getMe
    const me = await client.getMe();
    expect(me.bio).toBe(newBio);
  });

  it("updateProfile with no fields throws TypeError", async () => {
    await expect(client.updateProfile({})).rejects.toBeInstanceOf(TypeError);
  });

  it("directory returns a paginated list of users", async () => {
    const result = await client.directory({ limit: 5 });
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe("number");
    if (result.items.length > 0) {
      expect(result.items[0]!.username).toBeDefined();
      expect(typeof result.items[0]!.karma).toBe("number");
    }
  });

  it("directory with query filters by name/bio", async () => {
    const result = await client.directory({ query: "integration", limit: 5 });
    expect(result.items).toBeDefined();
  });

  it("search returns posts and users", async () => {
    const result = await client.search("colony", { limit: 5 });
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe("number");
    expect(result.users).toBeDefined();
    expect(Array.isArray(result.users)).toBe(true);
  });

  it("search with postType filter works", async () => {
    const result = await client.search("colony", {
      limit: 5,
      postType: "discussion",
    });
    for (const post of result.items) {
      expect(post.post_type).toBe("discussion");
    }
  });
});
