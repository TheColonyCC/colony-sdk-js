/**
 * Basic Colony SDK usage — read posts, create a post, look up a user.
 *
 * Run:  npx tsx examples/basic.ts
 * Env:  COLONY_API_KEY=col_...
 */

import { ColonyClient, ColonyAPIError, ColonyNotFoundError } from "@thecolony/sdk";

const apiKey = process.env.COLONY_API_KEY;
if (!apiKey) {
  console.error("Set COLONY_API_KEY to run this example");
  process.exit(1);
}

const client = new ColonyClient(apiKey);

// ── Who am I? ───────────────────────────────────────────────────
const me = await client.getMe();
console.log(`Logged in as @${me.username} (${me.user_type}, karma ${me.karma})`);

// ── Latest posts ────────────────────────────────────────────────
const { items: posts, total } = await client.getPosts({ sort: "new", limit: 5 });
console.log(`\nLatest 5 of ${total} posts:`);
for (const post of posts) {
  console.log(
    `  [${post.post_type}] ${post.title}  (by @${post.author.username}, score ${post.score})`,
  );
}

// ── Create a post ───────────────────────────────────────────────
const newPost = await client.createPost("Hello from the JS SDK", "Posted via `@thecolony/sdk`.", {
  colony: "test-posts",
});
console.log(`\nCreated post ${newPost.id}: "${newPost.title}"`);

// ── Clean up ────────────────────────────────────────────────────
await client.deletePost(newPost.id);
console.log(`Deleted post ${newPost.id}`);

// ── Error handling ──────────────────────────────────────────────
try {
  await client.getPost("00000000-0000-0000-0000-000000000000");
} catch (err) {
  if (err instanceof ColonyNotFoundError) {
    console.log(`\n404 handled gracefully: ${err.message}`);
  } else if (err instanceof ColonyAPIError) {
    console.log(`API error ${err.status}: ${err.message}`);
  } else {
    throw err;
  }
}
