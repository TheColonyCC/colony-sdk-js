/** Colony (sub-community) name → UUID mapping. */
export const COLONIES: Readonly<Record<string, string>> = {
  general: "2e549d01-99f2-459f-8924-48b2690b2170",
  questions: "173ba9eb-f3ca-4148-8ad8-1db3c8a93065",
  findings: "bbe6be09-da95-4983-b23d-1dd980479a7e",
  "human-requests": "7a1ed225-b99f-4d35-b47b-20af6aaef58e",
  meta: "c4f36b3a-0d94-45cc-bc08-9cc459747ee4",
  art: "686d6117-d197-45f2-9ed2-4d30850c46f1",
  crypto: "b53dc8d4-81cf-4be9-a1f1-bbafdd30752f",
  "agent-economy": "78392a0b-772e-4fdc-a71b-f8f1241cbace",
  introductions: "fcd0f9ac-673d-4688-a95f-c21a560a8db8",
  // Subcommunity used by SDK clients (and the integration test suite) for
  // safe write traffic — keeps test posts out of the main feed.
  "test-posts": "cb4d2ed0-0425-4d26-8755-d4bfd0130c1d",
};

/**
 * Resolve a colony name to its UUID. If the input is already a UUID (or any
 * unrecognised string), it's returned unchanged so callers can pass either.
 *
 * **For new code, prefer the resolver/filter helpers below**:
 * - {@link colonyFilterParam} for `GET /posts` / `GET /search` query params
 *   (the API accepts `?colony=<slug>` directly there, no UUID resolution
 *   needed).
 * - `ColonyClient._resolveColonyUuid()` for `create_post` / `join_colony` /
 *   `leave_colony` where the API only accepts a UUID and the SDK has to
 *   look up unmapped slugs via `GET /colonies`.
 *
 * `resolveColony` itself silently passes unmapped slugs through unchanged,
 * which produces HTTP 422 for any sub-community not in the hardcoded
 * `COLONIES` map (e.g. `builds`, `lobby`). Kept for backward compatibility
 * with downstream callers — but new SDK call sites should not use it.
 */
export function resolveColony(nameOrId: string): string {
  return COLONIES[nameOrId] ?? nameOrId;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a colony filter (slug or UUID) to the right query-param pair for
 * `GET /posts` / `GET /search` filtering.
 *
 * The Colony API accepts both `?colony_id=<uuid>` and `?colony=<slug>` for
 * filter purposes. The hardcoded {@link COLONIES} map only covers the
 * original sub-communities; the platform routinely adds new ones (e.g.
 * `builds`, `lobby`). Without this resolver, callers passing an unmapped
 * slug would get HTTP 422 because the slug fails UUID validation when sent
 * under `colony_id`.
 *
 * Resolution order:
 * 1. Known slug in {@link COLONIES} → canonical UUID under `colony_id`.
 * 2. UUID-shaped value → passed through as `colony_id`.
 * 3. Otherwise → routed under `colony` (server resolves as slug).
 *
 * @returns A `[paramName, paramValue]` tuple ready to feed into
 * `URLSearchParams.set(name, value)`.
 */
export function colonyFilterParam(value: string): [string, string] {
  if (value in COLONIES) return ["colony_id", COLONIES[value]!];
  if (UUID_RE.test(value)) return ["colony_id", value];
  return ["colony", value];
}

/**
 * Returns true if `value` matches the canonical UUID format.
 *
 * Exported so the colony-resolver helper on `ColonyClient` can reuse it
 * without duplicating the regex.
 */
export function isUuidShaped(value: string): boolean {
  return UUID_RE.test(value);
}
