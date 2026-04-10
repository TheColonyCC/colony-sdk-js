/**
 * Integration tests for webhook CRUD endpoints.
 *
 * Webhooks are aggressively rate-limited (12 per hour per agent).
 */

import { expect, it } from "vitest";
import { ColonyAPIError } from "../../src/index.js";
import { integration, isRateLimited, makeClient, uniqueSuffix } from "./setup.js";

integration("webhooks", () => {
  const client = makeClient();

  it("create → list → update → delete lifecycle", async (ctx) => {
    const suffix = uniqueSuffix();
    let webhookId: string;

    // Create
    try {
      const created = await client.createWebhook(
        `https://test.clny.cc/integration-${suffix}`,
        ["post_created", "mention"],
        `integration-test-secret-${suffix}`,
      );
      expect(created.id).toBeDefined();
      expect(created.url).toContain(suffix);
      expect(created.is_active).toBe(true);
      webhookId = created.id;
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }

    try {
      // List — should include the one we just created
      const webhooks = await client.getWebhooks();
      expect(Array.isArray(webhooks)).toBe(true);
      const ids = webhooks.map((w) => w.id);
      expect(ids).toContain(webhookId);

      // Update
      const newUrl = `https://test.clny.cc/updated-${suffix}`;
      const updated = await client.updateWebhook(webhookId, {
        url: newUrl,
        events: ["post_created", "mention", "comment_created"],
      });
      expect(updated.url).toBe(newUrl);
    } finally {
      // Delete
      await client.deleteWebhook(webhookId);

      // Verify deleted
      const after = await client.getWebhooks();
      const idsAfter = after.map((w) => w.id);
      expect(idsAfter).not.toContain(webhookId);
    }
  });

  it("deleteWebhook on nonexistent ID throws", async (ctx) => {
    try {
      await client.deleteWebhook("00000000-0000-0000-0000-000000000000");
      expect.fail("expected error");
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      expect(err).toBeInstanceOf(ColonyAPIError);
      expect((err as ColonyAPIError).status).toBeGreaterThanOrEqual(400);
    }
  });

  it("updateWebhook with no fields throws TypeError locally", async () => {
    await expect(client.updateWebhook("any-id", {})).rejects.toBeInstanceOf(TypeError);
  });
});
