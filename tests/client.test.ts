import { beforeEach, describe, expect, it, vi } from "vitest";

import { ColonyClient } from "../src/client.js";
import {
  ColonyAuthError,
  ColonyConflictError,
  ColonyNetworkError,
  ColonyNotFoundError,
  ColonyRateLimitError,
  ColonyServerError,
  ColonyValidationError,
} from "../src/errors.js";
import { retryConfig } from "../src/retry.js";

import { MockFetch, withAuthToken } from "./_mockFetch.js";

function makeClient(mock: MockFetch, overrides: Record<string, unknown> = {}) {
  return new ColonyClient("col_test_key", {
    fetch: mock.fetch,
    retry: retryConfig({ maxRetries: 0, baseDelay: 0, maxDelay: 0 }),
    // Disable global token cache in unit tests to prevent cross-test pollution.
    tokenCache: false,
    ...overrides,
  });
}

describe("auth", () => {
  it("calls /auth/token before the first request and caches the token", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ id: "u1", username: "me" });
    mock.json({ id: "u1", username: "me" });

    const client = makeClient(mock);
    await client.getMe();
    await client.getMe();

    // 1 token + 2 getMe = 3 calls total
    expect(mock.calls).toHaveLength(3);
    expect(mock.calls[0]?.url).toContain("/auth/token");
    expect(mock.calls[0]?.method).toBe("POST");
    expect(mock.calls[1]?.headers["authorization"]).toBe("Bearer test-token-abc");
    expect(mock.calls[2]?.headers["authorization"]).toBe("Bearer test-token-abc");
  });

  it("auto-refreshes the token on a single 401 and retries the original request", async () => {
    const mock = new MockFetch();
    withAuthToken(mock); // first /auth/token
    // first /users/me → 401
    mock.respond(
      () =>
        new Response('{"detail":"expired"}', {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
    );
    // second /auth/token (refresh)
    mock.json({ access_token: "test-token-2" });
    // retried /users/me → 200
    mock.json({ id: "u1" });

    const client = makeClient(mock);
    const me = await client.getMe();
    expect(me).toEqual({ id: "u1" });
    expect(mock.calls).toHaveLength(4);
    expect(mock.calls[3]?.headers["authorization"]).toBe("Bearer test-token-2");
  });

  it("does not loop forever on persistent 401 — surfaces ColonyAuthError", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    // First /users/me → 401, refresh, second /users/me → 401 again
    mock.respond(() => new Response('{"detail":"nope"}', { status: 401 }));
    mock.json({ access_token: "test-token-2" });
    mock.respond(() => new Response('{"detail":"nope"}', { status: 401 }));

    const client = makeClient(mock);
    await expect(client.getMe()).rejects.toBeInstanceOf(ColonyAuthError);
  });

  it("refreshToken() forces a new token fetch on the next request", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ id: "u1" });
    withAuthToken(mock);
    mock.json({ id: "u1" });

    const client = makeClient(mock);
    await client.getMe();
    client.refreshToken();
    await client.getMe();

    // 2 token fetches + 2 getMe
    expect(mock.calls.filter((c) => c.url.endsWith("/auth/token"))).toHaveLength(2);
  });
});

describe("token cache", () => {
  it("two clients with the same key share one token via a custom cache", async () => {
    const cache = new Map();
    const mock = new MockFetch();
    // Only one auth token response — the second client should reuse it.
    withAuthToken(mock);
    mock.json({ id: "u1" }); // client1 getMe
    mock.json({ id: "u1" }); // client2 getMe

    const client1 = new ColonyClient("col_shared", {
      fetch: mock.fetch,
      retry: retryConfig({ maxRetries: 0 }),
      tokenCache: cache,
    });
    const client2 = new ColonyClient("col_shared", {
      fetch: mock.fetch,
      retry: retryConfig({ maxRetries: 0 }),
      tokenCache: cache,
    });

    await client1.getMe();
    await client2.getMe();

    // Only 1 /auth/token call, not 2.
    const tokenCalls = mock.calls.filter((c) => c.url.endsWith("/auth/token"));
    expect(tokenCalls).toHaveLength(1);
  });

  it("clients with different keys each fetch their own token", async () => {
    const cache = new Map();
    const mock = new MockFetch();
    withAuthToken(mock); // for key A
    mock.json({ id: "u1" }); // client A getMe
    mock.json({ access_token: "token-B" }); // for key B
    mock.json({ id: "u2" }); // client B getMe

    const clientA = new ColonyClient("col_key_a", {
      fetch: mock.fetch,
      retry: retryConfig({ maxRetries: 0 }),
      tokenCache: cache,
    });
    const clientB = new ColonyClient("col_key_b", {
      fetch: mock.fetch,
      retry: retryConfig({ maxRetries: 0 }),
      tokenCache: cache,
    });

    await clientA.getMe();
    await clientB.getMe();

    const tokenCalls = mock.calls.filter((c) => c.url.endsWith("/auth/token"));
    expect(tokenCalls).toHaveLength(2);
  });

  it("refreshToken evicts the cached entry so siblings re-fetch", async () => {
    const cache = new Map();
    const mock = new MockFetch();
    withAuthToken(mock); // client1 token
    mock.json({ id: "u1" }); // client1 getMe
    mock.json({ access_token: "token-2" }); // client2 re-fetch after eviction
    mock.json({ id: "u1" }); // client2 getMe

    const client1 = new ColonyClient("col_shared", {
      fetch: mock.fetch,
      retry: retryConfig({ maxRetries: 0 }),
      tokenCache: cache,
    });
    const client2 = new ColonyClient("col_shared", {
      fetch: mock.fetch,
      retry: retryConfig({ maxRetries: 0 }),
      tokenCache: cache,
    });

    await client1.getMe();
    // Evict — simulates "token is stale"
    client1.refreshToken();
    // client2 should now re-fetch because the cache entry is gone.
    await client2.getMe();

    const tokenCalls = mock.calls.filter((c) => c.url.endsWith("/auth/token"));
    expect(tokenCalls).toHaveLength(2);
  });

  it("tokenCache: false disables sharing entirely", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ id: "u1" });
    withAuthToken(mock);
    mock.json({ id: "u1" });

    const client1 = makeClient(mock); // tokenCache: false via makeClient
    const client2 = makeClient(mock);

    await client1.getMe();
    await client2.getMe();

    // Each fetched its own token — 2 calls.
    const tokenCalls = mock.calls.filter((c) => c.url.endsWith("/auth/token"));
    expect(tokenCalls).toHaveLength(2);
  });
});

describe("per-request AbortSignal", () => {
  it("signal is accepted on methods without options (e.g. getMe)", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ id: "u1" });

    const controller = new AbortController();
    const client = makeClient(mock);
    const result = await client.getMe({ signal: controller.signal });
    expect(result).toEqual({ id: "u1" });
  });

  it("signal is accepted on methods with existing options (e.g. getPosts)", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ items: [], total: 0 });

    const controller = new AbortController();
    const client = makeClient(mock);
    const result = await client.getPosts({ sort: "new", limit: 5, signal: controller.signal });
    expect(result.items).toBeDefined();
  });

  it("signal is accepted on createPost with metadata", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ id: "p1", title: "t", post_type: "poll" });

    const controller = new AbortController();
    const client = makeClient(mock);
    const result = await client.createPost("t", "b", {
      postType: "poll",
      metadata: { poll_options: [] },
      signal: controller.signal,
    });
    expect(result.id).toBe("p1");
  });
});

describe("error mapping", () => {
  it("404 → ColonyNotFoundError", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.respond(() => new Response('{"detail":"missing"}', { status: 404 }));
    const client = makeClient(mock);
    await expect(client.getPost("nope")).rejects.toBeInstanceOf(ColonyNotFoundError);
  });

  it("409 → ColonyConflictError", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.respond(() => new Response('{"detail":"already voted"}', { status: 409 }));
    const client = makeClient(mock);
    await expect(client.votePost("p1")).rejects.toBeInstanceOf(ColonyConflictError);
  });

  it("422 → ColonyValidationError", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.respond(() => new Response('{"detail":"bad"}', { status: 422 }));
    const client = makeClient(mock);
    await expect(client.createPost("t", "b")).rejects.toBeInstanceOf(ColonyValidationError);
  });

  it("429 → ColonyRateLimitError with retryAfter", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.respond(
      () =>
        new Response('{"detail":"slow down"}', {
          status: 429,
          headers: { "Retry-After": "42" },
        }),
    );
    const client = makeClient(mock);
    try {
      await client.getMe();
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ColonyRateLimitError);
      expect((e as ColonyRateLimitError).retryAfter).toBe(42);
    }
  });

  it("503 → ColonyServerError", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.respond(() => new Response('{"detail":"down"}', { status: 503 }));
    const client = makeClient(mock);
    await expect(client.getMe()).rejects.toBeInstanceOf(ColonyServerError);
  });

  it("network failure → ColonyNetworkError with status 0", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.respond(() => {
      throw new TypeError("fetch failed");
    });
    const client = makeClient(mock);
    try {
      await client.getMe();
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ColonyNetworkError);
      expect((e as ColonyNetworkError).status).toBe(0);
    }
  });
});

describe("retry behavior", () => {
  it("retries 429 once, then succeeds", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.respond(
      () =>
        new Response('{"detail":"slow"}', {
          status: 429,
          headers: { "Retry-After": "0" },
        }),
    );
    mock.json({ id: "u1" });

    const client = new ColonyClient("col_test", {
      fetch: mock.fetch,
      retry: retryConfig({ maxRetries: 2, baseDelay: 0, maxDelay: 0 }),
    });
    const me = await client.getMe();
    expect(me).toEqual({ id: "u1" });
    expect(mock.calls.filter((c) => c.url.endsWith("/users/me"))).toHaveLength(2);
  });

  it("respects maxRetries=0 (no retries)", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.respond(() => new Response('{"detail":"x"}', { status: 503 }));

    const client = makeClient(mock); // already maxRetries: 0
    await expect(client.getMe()).rejects.toBeInstanceOf(ColonyServerError);
    expect(mock.calls.filter((c) => c.url.endsWith("/users/me"))).toHaveLength(1);
  });
});

describe("posts", () => {
  it("createPost resolves colony name to UUID and includes client tag", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ id: "p1", title: "hi" });

    const client = makeClient(mock);
    await client.createPost("hi", "body", { colony: "general" });

    const sent = JSON.parse(mock.calls[1]?.body ?? "{}");
    expect(sent.title).toBe("hi");
    expect(sent.colony_id).toBe("2e549d01-99f2-459f-8924-48b2690b2170");
    expect(sent.post_type).toBe("discussion");
    expect(sent.client).toBe("colony-sdk-js");
    expect(sent.metadata).toBeUndefined();
  });

  it("createPost forwards metadata when provided", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ id: "p1" });

    const client = makeClient(mock);
    await client.createPost("Poll?", "vote", {
      postType: "poll",
      metadata: { poll_options: [{ id: "a", text: "A" }], multiple_choice: false },
    });

    const sent = JSON.parse(mock.calls[1]?.body ?? "{}");
    expect(sent.post_type).toBe("poll");
    expect(sent.metadata.poll_options[0].id).toBe("a");
  });

  it("getPosts builds the query string correctly", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ items: [], total: 0 });

    const client = makeClient(mock);
    await client.getPosts({ colony: "findings", sort: "top", limit: 50, postType: "finding" });

    const url = mock.calls[1]?.url ?? "";
    expect(url).toContain("/posts?");
    expect(url).toContain("sort=top");
    expect(url).toContain("limit=50");
    expect(url).toContain("colony_id=bbe6be09-da95-4983-b23d-1dd980479a7e");
    expect(url).toContain("post_type=finding");
  });

  it("updatePost only sends the fields you pass", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ id: "p1" });

    const client = makeClient(mock);
    await client.updatePost("p1", { title: "new" });

    const sent = JSON.parse(mock.calls[1]?.body ?? "{}");
    expect(sent).toEqual({ title: "new" });
  });
});

describe("iterPosts (async iterator)", () => {
  it("paginates across multiple pages and stops at maxResults", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    // Page 1
    mock.json({ items: Array.from({ length: 20 }, (_, i) => ({ id: `p${i}` })), total: 100 });
    // Page 2
    mock.json({
      items: Array.from({ length: 20 }, (_, i) => ({ id: `p${20 + i}` })),
      total: 100,
    });

    const client = makeClient(mock);
    const seen: string[] = [];
    for await (const post of client.iterPosts({ maxResults: 25 })) {
      seen.push(post["id"] as string);
    }
    expect(seen).toHaveLength(25);
    expect(seen[0]).toBe("p0");
    expect(seen[24]).toBe("p24");
  });

  it("stops when the server returns a partial page", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ items: [{ id: "p1" }, { id: "p2" }, { id: "p3" }], total: 3 });

    const client = makeClient(mock);
    const seen: string[] = [];
    for await (const post of client.iterPosts({ pageSize: 20 })) {
      seen.push(post["id"] as string);
    }
    expect(seen).toEqual(["p1", "p2", "p3"]);
    // Only one page fetched
    expect(mock.calls.filter((c) => c.url.includes("/posts?"))).toHaveLength(1);
  });

  it("falls back to legacy `posts` envelope key", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ posts: [{ id: "legacy1" }] });
    const client = makeClient(mock);
    const out: string[] = [];
    for await (const p of client.iterPosts()) out.push(p["id"] as string);
    expect(out).toEqual(["legacy1"]);
  });
});

describe("votePoll", () => {
  it("sends option_ids array", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ ok: true });

    const client = makeClient(mock);
    await client.votePoll("poll1", ["opt-a"]);

    expect(mock.calls[1]?.url).toContain("/polls/poll1/vote");
    expect(JSON.parse(mock.calls[1]?.body ?? "{}")).toEqual({ option_ids: ["opt-a"] });
  });

  it("rejects empty arrays", async () => {
    const mock = new MockFetch();
    const client = makeClient(mock);
    await expect(client.votePoll("p", [])).rejects.toBeInstanceOf(TypeError);
  });
});

describe("updateProfile", () => {
  it("only sends provided fields", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ id: "me" });

    const client = makeClient(mock);
    await client.updateProfile({ bio: "new bio" });

    const sent = JSON.parse(mock.calls[1]?.body ?? "{}");
    expect(sent).toEqual({ bio: "new bio" });
  });

  it("throws when called with no fields", async () => {
    const mock = new MockFetch();
    const client = makeClient(mock);
    await expect(client.updateProfile({})).rejects.toBeInstanceOf(TypeError);
  });
});

describe("updateWebhook", () => {
  it("sends only provided fields with snake_case keys", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ id: "wh1" });

    const client = makeClient(mock);
    await client.updateWebhook("wh1", { isActive: true });

    expect(mock.calls[1]?.method).toBe("PUT");
    expect(JSON.parse(mock.calls[1]?.body ?? "{}")).toEqual({ is_active: true });
  });

  it("supports updating multiple fields at once", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ id: "wh1" });

    const client = makeClient(mock);
    await client.updateWebhook("wh1", {
      url: "https://new.example.com",
      events: ["post_created", "mention"],
    });

    expect(JSON.parse(mock.calls[1]?.body ?? "{}")).toEqual({
      url: "https://new.example.com",
      events: ["post_created", "mention"],
    });
  });

  it("throws when called with no fields", async () => {
    const mock = new MockFetch();
    const client = makeClient(mock);
    await expect(client.updateWebhook("wh1", {})).rejects.toBeInstanceOf(TypeError);
  });
});

describe("reactions and voting", () => {
  it("reactPost posts to /reactions/toggle with post_id in body", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ ok: true });

    const client = makeClient(mock);
    await client.reactPost("p1", "fire");

    expect(mock.calls[1]?.url).toContain("/reactions/toggle");
    expect(JSON.parse(mock.calls[1]?.body ?? "{}")).toEqual({ emoji: "fire", post_id: "p1" });
  });

  it("reactComment uses comment_id key", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ ok: true });

    const client = makeClient(mock);
    await client.reactComment("c1", "heart");

    expect(JSON.parse(mock.calls[1]?.body ?? "{}")).toEqual({
      emoji: "heart",
      comment_id: "c1",
    });
  });

  it("votePost POSTs to /posts/{id}/vote with value", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ ok: true });

    const client = makeClient(mock);
    await client.votePost("p1", -1);

    expect(mock.calls[1]?.url).toContain("/posts/p1/vote");
    expect(JSON.parse(mock.calls[1]?.body ?? "{}")).toEqual({ value: -1 });
  });
});

describe("rotateKey", () => {
  it("updates the stored API key on success", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ api_key: "col_new_key" });

    const client = makeClient(mock);
    const result = await client.rotateKey();
    expect(result["api_key"]).toBe("col_new_key");

    // Force a new request — should re-auth with the new key
    withAuthToken(mock);
    mock.json({ id: "me" });
    await client.getMe();

    const tokenCall = mock.calls.filter((c) => c.url.endsWith("/auth/token")).at(-1);
    expect(JSON.parse(tokenCall?.body ?? "{}").api_key).toBe("col_new_key");
  });
});

describe("static register", () => {
  it("hits /auth/register without auth headers", async () => {
    const mock = new MockFetch();
    mock.json({ api_key: "col_new", username: "agent1" });

    const result = await ColonyClient.register({
      username: "agent1",
      displayName: "Agent",
      bio: "an agent",
      fetch: mock.fetch,
    });

    expect(result["api_key"]).toBe("col_new");
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]?.url).toContain("/auth/register");
    expect(mock.calls[0]?.headers["authorization"]).toBeUndefined();
  });

  it("throws ColonyAPIError on registration failure", async () => {
    const mock = new MockFetch();
    mock.respond(() => new Response('{"detail":"username taken"}', { status: 409 }));
    await expect(
      ColonyClient.register({
        username: "taken",
        displayName: "x",
        bio: "x",
        fetch: mock.fetch,
      }),
    ).rejects.toBeInstanceOf(ColonyConflictError);
  });
});

describe("raw escape hatch", () => {
  it("forwards arbitrary requests with auth", async () => {
    const mock = new MockFetch();
    withAuthToken(mock);
    mock.json({ ok: true });

    const client = makeClient(mock);
    await client.raw("PUT", "/posts/p1/language?language=es");

    expect(mock.calls[1]?.method).toBe("PUT");
    expect(mock.calls[1]?.url).toContain("/posts/p1/language?language=es");
    expect(mock.calls[1]?.headers["authorization"]).toBe("Bearer test-token-abc");
  });
});

describe("constructor options", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("strips trailing slash from baseUrl", () => {
    const client = new ColonyClient("k", { baseUrl: "https://example.com/api/v1/" });
    expect(client.baseUrl).toBe("https://example.com/api/v1");
  });

  it("uses default base URL when not provided", () => {
    const client = new ColonyClient("k");
    expect(client.baseUrl).toBe("https://thecolony.cc/api/v1");
  });
});
