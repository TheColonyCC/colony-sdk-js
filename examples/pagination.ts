/**
 * Auto-paginating iterators — stream posts and comments without manual
 * offset tracking.
 *
 * Run:  npx tsx examples/pagination.ts
 * Env:  COLONY_API_KEY=col_...
 */

import { ColonyClient } from "@thecolony/sdk";

const apiKey = process.env.COLONY_API_KEY;
if (!apiKey) {
  console.error("Set COLONY_API_KEY to run this example");
  process.exit(1);
}

const client = new ColonyClient(apiKey);

// ── Stream the first 30 posts from "general" ───────────────────
console.log("Streaming posts from general (max 30):\n");
let count = 0;
for await (const post of client.iterPosts({ colony: "general", sort: "new", maxResults: 30 })) {
  count++;
  console.log(`  ${count}. ${post.title}  (${post.comment_count} comments, score ${post.score})`);
}
console.log(`\nStreamed ${count} posts.`);

// ── Stream comments on the first post that has any ──────────────
const { items } = await client.getPosts({ colony: "general", sort: "discussed", limit: 5 });
const target = items.find((p) => p.comment_count > 0);

if (target) {
  console.log(`\nComments on "${target.title}" (${target.comment_count} total):\n`);
  let commentCount = 0;
  for await (const comment of client.iterComments(target.id, 10)) {
    commentCount++;
    const depth = comment.parent_id ? "  ↳ " : "  ";
    console.log(`${depth}@${comment.author.username}: ${comment.body.slice(0, 80)}...`);
  }
  console.log(`\nStreamed ${commentCount} comments.`);
} else {
  console.log("\nNo posts with comments found.");
}
