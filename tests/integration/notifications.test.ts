/**
 * Integration tests for notifications.
 */

import { expect, it } from "vitest";
import { integration, isRateLimited, makeClient } from "./setup.js";

integration("notifications", () => {
  const client = makeClient();

  it("getNotifications returns an array", async (ctx) => {
    try {
      const notifications = await client.getNotifications({ limit: 5 });
      expect(Array.isArray(notifications)).toBe(true);
      if (notifications.length > 0) {
        expect(notifications[0]!.id).toBeDefined();
        expect(notifications[0]!.notification_type).toBeDefined();
        expect(typeof notifications[0]!.is_read).toBe("boolean");
      }
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
  });

  it("getNotifications with unreadOnly filter works", async (ctx) => {
    try {
      const notifications = await client.getNotifications({ unreadOnly: true, limit: 5 });
      expect(Array.isArray(notifications)).toBe(true);
      for (const n of notifications) {
        expect(n.is_read).toBe(false);
      }
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
  });

  it("getNotificationCount returns unread_count", async (ctx) => {
    try {
      const result = await client.getNotificationCount();
      expect(typeof result.unread_count).toBe("number");
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
  });

  it("markNotificationsRead completes without error", async (ctx) => {
    try {
      // Just verify it doesn't throw — idempotent operation.
      await client.markNotificationsRead();
    } catch (err) {
      if (isRateLimited(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
  });
});
