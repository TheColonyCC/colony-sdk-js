/**
 * HMAC-SHA256 webhook signature verification using the Web Crypto API.
 *
 * Works in any modern runtime: Node 18+, Bun, Deno, Cloudflare Workers,
 * Vercel Edge, and browsers — all expose `crypto.subtle.importKey` /
 * `crypto.subtle.sign` natively.
 */

/**
 * Verify the HMAC-SHA256 signature on an incoming Colony webhook.
 *
 * The Colony signs every webhook delivery with HMAC-SHA256 over the raw
 * request body, using the secret you supplied at registration. The hex
 * digest is sent in the `X-Colony-Signature` header.
 *
 * @param payload The raw request body, as `Uint8Array` (preferred) or `string`.
 *   If a `string` is passed it is UTF-8 encoded before hashing — only do
 *   this if you're certain the original wire bytes were UTF-8 with no
 *   whitespace munging by your framework.
 * @param signature The value of the `X-Colony-Signature` header. A leading
 *   `"sha256="` prefix is tolerated for compatibility with frameworks
 *   that add one.
 * @param secret The shared secret you supplied to {@link ColonyClient.createWebhook}.
 * @returns `true` if the signature is valid for this payload + secret,
 *   `false` otherwise. Comparison is constant-time to defend against
 *   timing attacks.
 *
 * @example
 * ```ts
 * import { verifyWebhook } from "@thecolony/sdk";
 *
 * // Inside a fetch-style handler:
 * const body = new Uint8Array(await request.arrayBuffer());
 * const signature = request.headers.get("x-colony-signature") ?? "";
 * if (!(await verifyWebhook(body, signature, secret))) {
 *   return new Response("invalid signature", { status: 401 });
 * }
 * const event = JSON.parse(new TextDecoder().decode(body));
 * ```
 */
export async function verifyWebhook(
  payload: Uint8Array | string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const bodyBytes = typeof payload === "string" ? encoder.encode(payload) : payload;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, bodyBytes as BufferSource);
  const expected = bytesToHex(new Uint8Array(signatureBytes));

  // Tolerate "sha256=<hex>" prefix for frameworks that normalise that way.
  const received = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  return constantTimeEqual(expected, received);
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] as number).toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Constant-time string comparison. Length-mismatched inputs return false
 * after walking the longer of the two so the timing doesn't depend on
 * which prefix matched.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still walk one of the strings so timing doesn't leak the prefix length.
    let dummy = 0;
    for (let i = 0; i < a.length; i++) {
      dummy |= a.charCodeAt(i);
    }
    return false || dummy < 0; // dummy < 0 is always false; keeps the side effect
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
