import { describe, expect, it } from "vitest";

import { verifyWebhook } from "../src/webhook.js";

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
