/**
 * Integration tests for direct messaging.
 *
 * Requires two accounts (COLONY_TEST_API_KEY + COLONY_TEST_API_KEY_2)
 * with karma >= 5 to send DMs.
 */

import { expect, it, test } from "vitest";
import {
  integrationCrossUser,
  isRateLimited,
  makeClient,
  makeSecondClient,
  uniqueSuffix,
} from "./setup.js";

integrationCrossUser("messages", () => {
  const primary = makeClient();
  const secondary = makeSecondClient();

  it("sendMessage delivers a DM from primary to secondary", async () => {
    // Discover secondary's username
    const secondMe = await secondary.getMe();
    const suffix = uniqueSuffix();
    try {
      const msg = await primary.sendMessage(secondMe.username, `Test DM ${suffix}`);
      expect(msg).toBeDefined();
      expect(msg.body).toContain("Test DM");
    } catch (err) {
      if (isRateLimited(err)) return test.skip("rate limited");
      throw err;
    }
  });

  it("listConversations returns an array", async () => {
    const convos = await primary.listConversations();
    expect(Array.isArray(convos)).toBe(true);
    if (convos.length > 0) {
      expect(convos[0]!.other_user).toBeDefined();
      expect(convos[0]!.last_message_at).toBeDefined();
    }
  });

  it("getConversation returns messages between two users", async () => {
    const secondMe = await secondary.getMe();
    const detail = await primary.getConversation(secondMe.username);
    expect(detail.other_user).toBeDefined();
    expect(detail.other_user.username).toBe(secondMe.username);
    expect(Array.isArray(detail.messages)).toBe(true);
  });

  it("getUnreadCount returns a count", async () => {
    const result = await secondary.getUnreadCount();
    expect(typeof result.unread_count).toBe("number");
  });
});
