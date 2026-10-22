import { describe, it, expect } from "vitest";
import { computeScore, tagFromScore } from "./scoring.js";

describe("tagFromScore", () => {
  it("uses the Hot / Warm / Cold boundaries", () => {
    expect(tagFromScore(100)).toBe("Hot");
    expect(tagFromScore(75)).toBe("Hot");
    expect(tagFromScore(74)).toBe("Warm");
    expect(tagFromScore(45)).toBe("Warm");
    expect(tagFromScore(44)).toBe("Cold");
    expect(tagFromScore(0)).toBe("Cold");
  });
});

describe("computeScore", () => {
  it("gives a ready buyer the maximum score", () => {
    const result = computeScore({
      timeline: "immediate",
      budget: "specific",
      requirement: "specific",
      engagement: "ready_to_act",
      objections: "none",
    });
    expect(result.score).toBe(100);
    expect(result.tag).toBe("Hot");
  });

  it("scores a slow buyer as Warm (3-6 months, interested)", () => {
    const result = computeScore({
      timeline: "medium",
      budget: "specific",
      requirement: "specific",
      engagement: "interested",
      objections: "none",
    });
    expect(result.score).toBe(72);
    expect(result.tag).toBe("Warm");
  });

  it("scores someone who is only browsing as Cold", () => {
    const result = computeScore({
      timeline: "long",
      budget: "none",
      requirement: "vague",
      engagement: "browsing",
      objections: "none",
    });
    expect(result.score).toBe(23);
    expect(result.tag).toBe("Cold");
  });

  it("subtracts 5 points when another person must approve", () => {
    const base = {
      timeline: "immediate",
      budget: "specific",
      requirement: "specific",
      engagement: "ready_to_act",
      objections: "none",
    };
    const result = computeScore({ ...base, needsApproval: true });
    expect(result.score).toBe(95);
    expect(result.breakdown.at(-1).points).toBe(-5);
  });

  it("caps the score at 10 for spam", () => {
    const result = computeScore({
      timeline: "immediate",
      budget: "specific",
      requirement: "specific",
      engagement: "ready_to_act",
      objections: "none",
      isSpam: true,
    });
    expect(result.score).toBe(10);
    expect(result.tag).toBe("Cold");
  });

  it("falls back to safe defaults for missing or unknown values", () => {
    const result = computeScore({ timeline: "tomorrow-ish", budget: 123 });
    expect(result.signals.timeline).toBe("unknown");
    expect(result.signals.budget).toBe("none");
    expect(result.score).toBe(25);
    expect(computeScore().score).toBe(25);
  });

  it("is deterministic: the same signals always give the same result", () => {
    const signals = {
      timeline: "short",
      budget: "vague",
      requirement: "partial",
      engagement: "interested",
      objections: "minor",
    };
    expect(computeScore(signals)).toEqual(computeScore(signals));
  });

  it("shows readable labels without underscores", () => {
    const result = computeScore({ engagement: "ready_to_act" });
    const engagement = result.breakdown.find((b) => b.label === "Engagement");
    expect(engagement.value).toBe("ready to act");
  });
});