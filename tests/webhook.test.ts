import { describe, expect, it } from "vitest";

import {
  ColonyWebhookVerificationError,
  verifyAndParseWebhook,
  verifyWebhook,
} from "../src/webhook.js";
import type { WebhookEventEnvelope } from "../src/types.js";

const SECRET = "this-is-a-test-secret-1234";
// HMAC-SHA256("hello", SECRET) computed once and pinned for cross-runtime stability.
async function sign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] as number).toString(16).padStart(2, "0");
  }
  return hex;
}

describe("verifyWebhook", () => {
  it("accepts a valid signature on a string payload", async () => {
    const payload = '{"event":"post_created","payload":{"id":"1"}}';
    const sig = await sign(payload, SECRET);
    expect(await verifyWebhook(payload, sig, SECRET)).toBe(true);
  });

  it("accepts a valid signature on a Uint8Array payload", async () => {
    const payload = '{"event":"post_created"}';
    const sig = await sign(payload, SECRET);
    const bytes = new TextEncoder().encode(payload);
    expect(await verifyWebhook(bytes, sig, SECRET)).toBe(true);
  });

  it("rejects a signature signed with the wrong secret", async () => {
    const payload = "x";
    const sig = await sign(payload, "wrong-secret");
    expect(await verifyWebhook(payload, sig, SECRET)).toBe(false);
  });

  it("rejects a signature for a different payload", async () => {
    const sig = await sign("first", SECRET);
    expect(await verifyWebhook("second", sig, SECRET)).toBe(false);
  });

  it("tolerates a leading 'sha256=' prefix", async () => {
    const payload = "hello";
    const sig = await sign(payload, SECRET);
    expect(await verifyWebhook(payload, `sha256=${sig}`, SECRET)).toBe(true);
  });

  it("rejects empty / garbage signatures without throwing", async () => {
    expect(await verifyWebhook("hello", "", SECRET)).toBe(false);
    expect(await verifyWebhook("hello", "deadbeef", SECRET)).toBe(false);
  });

  it("rejects when signature length differs from expected", async () => {
    expect(await verifyWebhook("hello", "abc", SECRET)).toBe(false);
  });
});

describe("verifyAndParseWebhook", () => {
  it("returns a typed envelope on a valid post_created delivery", async () => {
    const body = JSON.stringify({
      event: "post_created",
      payload: {
        id: "p1",
        title: "Hello",
        body: "world",
        author: { id: "u1", username: "alice" },
      },
    });
    const sig = await sign(body, SECRET);
    const event: WebhookEventEnvelope = await verifyAndParseWebhook(body, sig, SECRET);
    expect(event.event).toBe("post_created");
    if (event.event === "post_created") {
      // Type narrowing: payload is now Post
      expect(event.payload.title).toBe("Hello");
      expect(event.payload.id).toBe("p1");
    }
  });

  it("narrows direct_message payload to Message", async () => {
    const body = JSON.stringify({
      event: "direct_message",
      payload: {
        id: "m1",
        conversation_id: "c1",
        body: "hi there",
        sender: { id: "u1", username: "alice" },
        is_read: false,
      },
    });
    const sig = await sign(body, SECRET);
    const event = await verifyAndParseWebhook(body, sig, SECRET);
    expect(event.event).toBe("direct_message");
    if (event.event === "direct_message") {
      expect(event.payload.body).toBe("hi there");
      expect(event.payload.sender.username).toBe("alice");
    }
  });

  it("throws ColonyWebhookVerificationError on bad signature", async () => {
    const body = JSON.stringify({ event: "post_created", payload: { id: "p1" } });
    await expect(verifyAndParseWebhook(body, "deadbeef", SECRET)).rejects.toBeInstanceOf(
      ColonyWebhookVerificationError,
    );
  });

  it("throws on non-JSON body even when signature is valid", async () => {
    const body = "not json";
    const sig = await sign(body, SECRET);
    await expect(verifyAndParseWebhook(body, sig, SECRET)).rejects.toBeInstanceOf(
      ColonyWebhookVerificationError,
    );
  });

  it("throws when body is a JSON array (not an object)", async () => {
    const body = "[1,2,3]";
    const sig = await sign(body, SECRET);
    await expect(verifyAndParseWebhook(body, sig, SECRET)).rejects.toThrow(/not a JSON object/);
  });

  it("throws when body is missing the `event` field", async () => {
    const body = JSON.stringify({ payload: { id: "p1" } });
    const sig = await sign(body, SECRET);
    await expect(verifyAndParseWebhook(body, sig, SECRET)).rejects.toThrow(
      /missing an `event` field/,
    );
  });

  it("works with Uint8Array payloads as well as strings", async () => {
    const body = JSON.stringify({ event: "post_created", payload: { id: "p1", title: "x" } });
    const sig = await sign(body, SECRET);
    const bytes = new TextEncoder().encode(body);
    const event = await verifyAndParseWebhook(bytes, sig, SECRET);
    expect(event.event).toBe("post_created");
  });
});
