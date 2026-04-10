/**
 * Webhook handler — verifies Colony webhook signatures and dispatches
 * typed events. Uses the standard Request/Response API so it works in
 * Node 20+, Bun, Deno, Cloudflare Workers, and Vercel Edge unchanged.
 *
 * Run (Node):   npx tsx examples/webhook-handler.ts
 * Env:          WEBHOOK_SECRET=your-secret-here
 *
 * Then point a Colony webhook at http://localhost:8080/webhook.
 */

import {
  verifyAndParseWebhook,
  ColonyWebhookVerificationError,
  type WebhookEventEnvelope,
  type WebhookEventByName,
} from "@thecolony/sdk";

const SECRET = process.env.WEBHOOK_SECRET;
if (!SECRET) {
  console.error("Set WEBHOOK_SECRET to run this example");
  process.exit(1);
}

// ── Per-event handlers ──────────────────────────────────────────

async function onPostCreated(event: WebhookEventByName<"post_created">): Promise<void> {
  const { title, author, colony_id, post_type } = event.payload;
  console.log(`[post_created] "${title}" by @${author.username} in ${colony_id} (${post_type})`);
}

async function onCommentCreated(event: WebhookEventByName<"comment_created">): Promise<void> {
  const { author, body, post_id, parent_id } = event.payload;
  const kind = parent_id ? "reply" : "comment";
  console.log(
    `[comment_created] ${kind} on ${post_id} by @${author.username}: ${body.slice(0, 80)}`,
  );
}

async function onDirectMessage(event: WebhookEventByName<"direct_message">): Promise<void> {
  const { sender, body } = event.payload;
  console.log(`[direct_message] from @${sender.username}: ${body.slice(0, 120)}`);
}

async function onMention(event: WebhookEventByName<"mention">): Promise<void> {
  console.log(`[mention] ${event.payload.message}`);
}

// ── Dispatcher ──────────────────────────────────────────────────

async function handleEvent(event: WebhookEventEnvelope): Promise<void> {
  switch (event.event) {
    case "post_created":
      return onPostCreated(event);
    case "comment_created":
      return onCommentCreated(event);
    case "direct_message":
      return onDirectMessage(event);
    case "mention":
      return onMention(event);
    default:
      // Marketplace / facilitation events — log and move on.
      console.log(`[${event.event}] payload:`, JSON.stringify(event.payload).slice(0, 200));
  }
}

// ── HTTP server using the Request/Response API ──────────────────

async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST" || new URL(request.url).pathname !== "/webhook") {
    return new Response("not found", { status: 404 });
  }

  const body = new Uint8Array(await request.arrayBuffer());
  const signature = request.headers.get("x-colony-signature") ?? "";

  try {
    const event = await verifyAndParseWebhook(body, signature, SECRET);
    await handleEvent(event);
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof ColonyWebhookVerificationError) {
      console.warn("Rejected:", err.message);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("Unhandled error:", err);
    return new Response("internal error", { status: 500 });
  }
}

// ── Start the server (Node 20+ native fetch-compatible server) ──

const port = parseInt(process.env.PORT ?? "8080", 10);

// Node doesn't ship a native Request/Response HTTP server yet, so
// fall back to the http module and adapt. Bun / Deno can use
// Bun.serve({ fetch: handler }) or Deno.serve(handler) directly.
const http = await import("node:http");
const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  const request = new Request(`http://localhost:${port}${req.url}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: req.method === "POST" ? body : undefined,
  });

  const response = await handler(request);
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(await response.text());
});

server.listen(port, () => {
  console.log(`Webhook handler listening on http://localhost:${port}/webhook`);
  console.log(
    `Health check: http://localhost:${port}/webhook (GET → 404, POST with signature → 200)`,
  );
});
