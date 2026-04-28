import { describe, expect, it } from "vitest";

import { COLONIES, colonyFilterParam, isUuidShaped, resolveColony } from "../src/colonies.js";

describe("COLONIES map", () => {
  it("contains the canonical colonies", () => {
    expect(COLONIES["general"]).toBe("2e549d01-99f2-459f-8924-48b2690b2170");
    expect(COLONIES["test-posts"]).toBe("cb4d2ed0-0425-4d26-8755-d4bfd0130c1d");
  });

  it("has the expected number of entries", () => {
    expect(Object.keys(COLONIES)).toHaveLength(10);
  });

  it("every value is a UUID", () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const id of Object.values(COLONIES)) {
      expect(id).toMatch(uuid);
    }
  });
});

describe("resolveColony", () => {
  it("resolves names to UUIDs", () => {
    expect(resolveColony("general")).toBe("2e549d01-99f2-459f-8924-48b2690b2170");
  });

  it("returns unknown strings unchanged (assumed to already be UUIDs)", () => {
    const raw = "00000000-0000-0000-0000-000000000000";
    expect(resolveColony(raw)).toBe(raw);
  });
});

describe("isUuidShaped", () => {
  it("matches canonical UUIDs", () => {
    expect(isUuidShaped("bbe6be09-da95-4983-b23d-1dd980479a7e")).toBe(true);
  });

  it("matches uppercase UUIDs", () => {
    expect(isUuidShaped("BBE6BE09-DA95-4983-B23D-1DD980479A7E")).toBe(true);
  });

  it("rejects slugs", () => {
    expect(isUuidShaped("builds")).toBe(false);
    expect(isUuidShaped("test-posts")).toBe(false);
  });

  it("rejects malformed strings", () => {
    expect(isUuidShaped("")).toBe(false);
    expect(isUuidShaped("00000000-0000-0000-0000-00000000000")).toBe(false); // 31-char tail
  });
});

describe("colonyFilterParam", () => {
  it("known slug → UUID under colony_id", () => {
    expect(colonyFilterParam("findings")).toEqual([
      "colony_id",
      "bbe6be09-da95-4983-b23d-1dd980479a7e",
    ]);
  });

  it("UUID-shaped value → passthrough as colony_id", () => {
    const u = "11111111-2222-3333-4444-555555555555";
    expect(colonyFilterParam(u)).toEqual(["colony_id", u]);
  });

  it("unknown slug → routed under colony", () => {
    // The platform routinely adds new sub-communities not in the
    // hardcoded COLONIES map. They must route to ?colony=<slug>,
    // which the API resolves server-side.
    expect(colonyFilterParam("builds")).toEqual(["colony", "builds"]);
    expect(colonyFilterParam("lobby")).toEqual(["colony", "lobby"]);
  });
});
