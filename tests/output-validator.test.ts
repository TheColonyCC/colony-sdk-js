import { describe, expect, it } from "vitest";

import {
  looksLikeModelError,
  stripLLMArtifacts,
  validateGeneratedOutput,
} from "../src/output-validator.js";

describe("looksLikeModelError", () => {
  it("catches the real-incident string", () => {
    expect(looksLikeModelError("Error generating text. Please try again later.")).toBe(true);
  });

  it("catches common provider error variants", () => {
    const cases = [
      "Error generating response",
      "Error generating content",
      "An error occurred",
      "Internal error",
      "Sorry, internal error",
      "Failed to generate",
      "Could not generate output",
      "Couldn't generate response",
      "Unable to connect to the model",
      "Unable to reach the model server",
      "Unable to generate a reply",
      "Unable to respond",
      "The model is unavailable",
      "Model is down",
      "Model is overloaded",
      "Model is offline",
      "Please try again later",
      "Try again later",
      "Request failed",
      "Request timed out",
      "Request timeout",
      "Rate limit exceeded",
      "Rate limited exceeded",
      "Service unavailable",
      "Service temporarily unavailable",
      "Timeout",
      "[error]: could not decode",
      "error: something broke",
    ];
    for (const s of cases) {
      expect(looksLikeModelError(s), `expected '${s}' to match`).toBe(true);
    }
  });

  it("catches apology-style errors", () => {
    expect(looksLikeModelError("I apologize, but I cannot do that.")).toBe(true);
    expect(looksLikeModelError("I apologize, I could not complete")).toBe(true);
    expect(looksLikeModelError("I'm sorry, but an error occurred.")).toBe(true);
    expect(looksLikeModelError("I'm sorry I couldn't help")).toBe(true);
  });

  it("does not flag legitimate long content discussing errors", () => {
    const legit = [
      "Today I want to talk about error handling in distributed systems. When a service fails, you have to decide whether to retry, fail fast, or degrade gracefully. Each approach has tradeoffs.",
      "Here's my take on rate limiting: good defaults matter more than clever algorithms. Most teams over-engineer this. A simple token bucket with sensible limits covers 95% of cases.",
      "Shipping announcement: the new scoring pipeline is live. It replaces the timeout-based heuristic we had with a proper sliding-window rate-limit tracker. Measured improvement is significant.",
    ];
    for (const s of legit) {
      expect(looksLikeModelError(s), `expected '${s}' NOT to match`).toBe(false);
    }
  });

  it("refuses to flag long outputs even if they start with an error-like phrase", () => {
    const long = "Timeout: " + "x".repeat(495);
    expect(long.length).toBeGreaterThan(500);
    expect(looksLikeModelError(long)).toBe(false);
  });

  it("handles empty and whitespace-only input", () => {
    expect(looksLikeModelError("")).toBe(false);
    expect(looksLikeModelError("   \n  ")).toBe(false);
  });

  it("is case-insensitive on the patterns", () => {
    expect(looksLikeModelError("ERROR GENERATING TEXT")).toBe(true);
    expect(looksLikeModelError("TIMEOUT")).toBe(true);
  });
});

describe("stripLLMArtifacts", () => {
  it("strips <s> / </s> tokens anywhere", () => {
    expect(stripLLMArtifacts("<s>hello</s>")).toBe("hello");
    expect(stripLLMArtifacts("hi <s>there</s>")).toBe("hi there");
  });

  it("strips [INST] / [/INST] / [SYS] / [USER] / [ASSISTANT] wrappers", () => {
    expect(stripLLMArtifacts("[INST]body[/INST]")).toBe("body");
    expect(stripLLMArtifacts("[SYSTEM]foo[/SYSTEM] bar")).toBe("foo bar");
    expect(stripLLMArtifacts("[USER]q[/USER][ASSISTANT]a[/ASSISTANT]")).toBe("qa");
  });

  it("strips <|im_start|>-style chat-template tokens", () => {
    expect(stripLLMArtifacts("<|im_start|>content<|im_end|>")).toBe("content");
    expect(stripLLMArtifacts("<|system|>x<|end|>")).toBe("x");
  });

  it("strips a leading role prefix", () => {
    expect(stripLLMArtifacts("Assistant: the reply")).toBe("the reply");
    expect(stripLLMArtifacts("AI: another")).toBe("another");
    expect(stripLLMArtifacts("Gemma: hello")).toBe("hello");
    expect(stripLLMArtifacts("Claude: hello")).toBe("hello");
    expect(stripLLMArtifacts("llama: hi")).toBe("hi");
    expect(stripLLMArtifacts("Bot: hi")).toBe("hi");
    expect(stripLLMArtifacts("Agent > msg")).toBe("msg");
  });

  it("strips meta-preambles", () => {
    expect(stripLLMArtifacts("Sure, here's the post: actual content here")).toBe(
      "actual content here",
    );
    expect(stripLLMArtifacts("Okay, here is my reply: body text")).toBe("body text");
    expect(stripLLMArtifacts("Certainly! Here's a response for you: the body")).toBe("the body");
    expect(stripLLMArtifacts("Of course, here is the reply: x")).toBe("x");
    expect(stripLLMArtifacts("Absolutely, here's a take: y")).toBe("y");
    expect(stripLLMArtifacts("Alright, I'll respond: z")).toBe("z");
    expect(stripLLMArtifacts("Here is my reply: hi")).toBe("hi");
  });

  it("strips bare labels", () => {
    expect(stripLLMArtifacts("Reply: my reply body")).toBe("my reply body");
    expect(stripLLMArtifacts("Output: generated output here")).toBe("generated output here");
    expect(stripLLMArtifacts("Response: x")).toBe("x");
    expect(stripLLMArtifacts("Answer: y")).toBe("y");
  });

  it("doesn't recurse across multiple preamble strips", () => {
    const out = stripLLMArtifacts("Sure, here's the post: Reply: actually start here");
    // First strip drops "Sure, here's the post:" — the residual "Reply:"
    // stays intact (audit-friendly over exhaustive).
    expect(out).toBe("Reply: actually start here");
  });

  it("leaves legitimate content unchanged", () => {
    const cases = [
      "A substantive post about rate limits",
      "Here is interesting data",
      "Let's discuss distributed consensus",
      "No prefix at all, just body.",
    ];
    for (const s of cases) {
      expect(stripLLMArtifacts(s), `expected '${s}' unchanged`).toBe(s);
    }
  });

  it("handles empty input", () => {
    expect(stripLLMArtifacts("")).toBe("");
    expect(stripLLMArtifacts("   ")).toBe("");
  });

  it("combines multiple artifact types in one pass", () => {
    expect(stripLLMArtifacts("<s>Assistant: Sure, here's the post: Hello!</s>")).toBe("Hello!");
  });
});

describe("validateGeneratedOutput", () => {
  it("returns ok:true with stripped content for good output", () => {
    expect(validateGeneratedOutput("Assistant: substantive reply")).toEqual({
      ok: true,
      content: "substantive reply",
    });
  });

  it("returns ok:true for plain content with no artifacts", () => {
    expect(validateGeneratedOutput("A clean reply.")).toEqual({
      ok: true,
      content: "A clean reply.",
    });
  });

  it("returns model_error for an error string", () => {
    expect(validateGeneratedOutput("Error generating text. Please try again later.")).toEqual({
      ok: false,
      reason: "model_error",
    });
  });

  it("returns empty when stripping removes everything", () => {
    expect(validateGeneratedOutput("<s></s>")).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(validateGeneratedOutput("   ")).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("strips artifacts BEFORE model-error check — role-prefixed errors classified correctly", () => {
    // Without the ordering, "Assistant: Error generating text" would pass
    // the error filter because the "Assistant:" prefix prevents the
    // `^error generating text` anchor from matching.
    expect(validateGeneratedOutput("Assistant: Error generating text.")).toEqual({
      ok: false,
      reason: "model_error",
    });
    expect(validateGeneratedOutput("<s>Gemma: Please try again later</s>")).toEqual({
      ok: false,
      reason: "model_error",
    });
  });

  it("narrows correctly via discriminated union", () => {
    const result = validateGeneratedOutput("hello");
    if (result.ok) {
      // TypeScript: result.content is string here
      expect(result.content).toBe("hello");
    } else {
      // TypeScript: result.reason is "empty" | "model_error" here
      expect.fail("expected ok:true");
    }
  });
});
