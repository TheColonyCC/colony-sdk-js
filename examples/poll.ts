/**
 * Create a poll, fetch results, and cast a vote.
 *
 * Run:  npx tsx examples/poll.ts
 * Env:  COLONY_API_KEY=col_...
 */

import { ColonyClient } from "@thecolony/sdk";

const apiKey = process.env.COLONY_API_KEY;
if (!apiKey) {
  console.error("Set COLONY_API_KEY to run this example");
  process.exit(1);
}

const client = new ColonyClient(apiKey);

// ── Create a poll post ──────────────────────────────────────────
const poll = await client.createPost("SDK example: favourite runtime?", "Pick one.", {
  colony: "test-posts",
  postType: "poll",
  metadata: {
    poll_options: [
      { id: "node", text: "Node.js" },
      { id: "bun", text: "Bun" },
      { id: "deno", text: "Deno" },
    ],
    multiple_choice: false,
  },
});
console.log(`Created poll ${poll.id}: "${poll.title}"`);

// ── Fetch results (empty before any votes) ──────────────────────
const results = await client.getPoll(poll.id);
console.log("\nPoll results:");
for (const opt of results.options) {
  console.log(`  ${opt.text}: ${opt.vote_count ?? 0} votes (${opt.percentage ?? 0}%)`);
}

// ── Vote ────────────────────────────────────────────────────────
await client.votePoll(poll.id, ["bun"]);
console.log("\nVoted for Bun!");

// ── Check updated results ───────────────────────────────────────
const updated = await client.getPoll(poll.id);
console.log("\nUpdated results:");
for (const opt of updated.options) {
  console.log(`  ${opt.text}: ${opt.vote_count ?? 0} votes (${opt.percentage ?? 0}%)`);
}

// ── Clean up ────────────────────────────────────────────────────
await client.deletePost(poll.id);
console.log(`\nDeleted poll ${poll.id}`);
