import { describe, expect, it } from "vitest";

import {
  ColonyAPIError,
  ColonyAuthError,
  ColonyConflictError,
  ColonyNetworkError,
  ColonyNotFoundError,
  ColonyRateLimitError,
  ColonyServerError,
  ColonyValidationError,
} from "../src/errors.js";
import { buildApiError, parseErrorBody } from "../src/errors.js";

describe("error hierarchy", () => {
  it("all subclasses extend ColonyAPIError", () => {
    expect(new ColonyAuthError("a", 401)).toBeInstanceOf(ColonyAPIError);
    expect(new ColonyNotFoundError("a", 404)).toBeInstanceOf(ColonyAPIError);
    expect(new ColonyConflictError("a", 409)).toBeInstanceOf(ColonyAPIError);
    expect(new ColonyValidationError("a", 422)).toBeInstanceOf(ColonyAPIError);
    expect(new ColonyRateLimitError("a", 429)).toBeInstanceOf(ColonyAPIError);
    expect(new ColonyServerError("a", 500)).toBeInstanceOf(ColonyAPIError);
    expect(new ColonyNetworkError("a")).toBeInstanceOf(ColonyAPIError);
  });

  it("preserves status, response, and code", () => {
    const e = new ColonyAuthError("nope", 401, { detail: "x" }, "AUTH_INVALID");
    expect(e.status).toBe(401);
    expect(e.response).toEqual({ detail: "x" });
    expect(e.code).toBe("AUTH_INVALID");
    expect(e.name).toBe("ColonyAuthError");
  });

  it("ColonyRateLimitError exposes retryAfter", () => {
    const e = new ColonyRateLimitError("slow down", 429, {}, "RATE_LIMIT", 30);
    expect(e.retryAfter).toBe(30);
  });

  it("ColonyNetworkError pins status to 0", () => {
    const e = new ColonyNetworkError("dns failure");
    expect(e.status).toBe(0);
  });
});

describe("parseErrorBody", () => {
  it("parses JSON object bodies", () => {
    expect(parseErrorBody('{"detail":"oops"}')).toEqual({ detail: "oops" });
  });

  it("returns empty object for non-JSON bodies", () => {
    expect(parseErrorBody("not json")).toEqual({});
  });

  it("returns empty object for JSON arrays (not objects)", () => {
    expect(parseErrorBody("[1,2,3]")).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseErrorBody("")).toEqual({});
  });
});

describe("buildApiError", () => {
  it("dispatches 401 to ColonyAuthError with status hint in message", () => {
    const e = buildApiError(
      401,
      '{"detail":"bad token"}',
      "fallback",
      "Colony API error (GET /me)",
    );
    expect(e).toBeInstanceOf(ColonyAuthError);
    expect(e.status).toBe(401);
    expect(e.message).toContain("Colony API error (GET /me)");
    expect(e.message).toContain("bad token");
    expect(e.message).toContain("unauthorized");
  });

  it("dispatches 404 to ColonyNotFoundError", () => {
    const e = buildApiError(404, '{"detail":"missing"}', "fallback", "Colony API error (GET /x)");
    expect(e).toBeInstanceOf(ColonyNotFoundError);
  });

  it("dispatches 409 to ColonyConflictError", () => {
    const e = buildApiError(409, '{"detail":"taken"}', "fallback", "Colony API error (POST /x)");
    expect(e).toBeInstanceOf(ColonyConflictError);
  });

  it("dispatches 400 and 422 to ColonyValidationError", () => {
    expect(buildApiError(400, "{}", "f", "p")).toBeInstanceOf(ColonyValidationError);
    expect(buildApiError(422, "{}", "f", "p")).toBeInstanceOf(ColonyValidationError);
  });

  it("dispatches 429 to ColonyRateLimitError with retryAfter", () => {
    const e = buildApiError(429, '{"detail":"chill"}', "f", "p", 12) as ColonyRateLimitError;
    expect(e).toBeInstanceOf(ColonyRateLimitError);
    expect(e.retryAfter).toBe(12);
  });

  it("dispatches 5xx to ColonyServerError", () => {
    expect(buildApiError(500, "{}", "f", "p")).toBeInstanceOf(ColonyServerError);
    expect(buildApiError(503, "{}", "f", "p")).toBeInstanceOf(ColonyServerError);
  });

  it("falls back to generic ColonyAPIError for unknown statuses", () => {
    const e = buildApiError(418, "{}", "I'm a teapot", "p");
    expect(e).toBeInstanceOf(ColonyAPIError);
    expect(e).not.toBeInstanceOf(ColonyServerError);
  });

  it("extracts code from structured detail object", () => {
    const e = buildApiError(
      429,
      '{"detail":{"message":"rate limited","code":"RATE_LIMIT_VOTE_HOURLY"}}',
      "f",
      "p",
    );
    expect(e.code).toBe("RATE_LIMIT_VOTE_HOURLY");
    expect(e.message).toContain("rate limited");
  });

  it("uses fallback when detail object has no message field", () => {
    const e = buildApiError(400, '{"detail":{"code":"SOME_CODE"}}', "my fallback", "p");
    expect(e.message).toContain("my fallback");
    expect(e.code).toBe("SOME_CODE");
  });

  it("uses fallback message when body has no detail", () => {
    const e = buildApiError(500, "", "Server exploded", "p");
    expect(e.message).toContain("Server exploded");
  });

  it("uses error field when detail is missing", () => {
    const e = buildApiError(400, '{"error":"missing field"}', "f", "p");
    expect(e.message).toContain("missing field");
  });
});
