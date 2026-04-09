import { describe, expect, it } from "vitest";

import { COLONIES, resolveColony } from "../src/colonies.js";

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
