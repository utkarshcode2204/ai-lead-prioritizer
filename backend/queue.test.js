import { describe, it, expect } from "vitest";
import { buildQueue, daysSince, lastTouchedAt } from "./queue.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-23T12:00:00Z");
const ago = (days) => new Date(NOW.getTime() - days * DAY);

function makeLead(overrides = {}) {
  return {
    _id: "lead",
    name: "Test lead",
    tag: "Hot",
    score: 80,
    createdAt: ago(0),
    debriefs: [],
    analysis: { nextAction: "Call today" },
    ...overrides,
  };
}

describe("lastTouchedAt", () => {
  it("uses the creation time when there are no calls", () => {
    const lead = makeLead({ createdAt: ago(5) });
    expect(lastTouchedAt(lead)).toBe(ago(5).getTime());
  });

  it("uses the most recent call when there is one", () => {
    const lead = makeLead({
      createdAt: ago(10),
      debriefs: [{ at: ago(6) }, { at: ago(2) }, { at: ago(4) }],
    });
    expect(lastTouchedAt(lead)).toBe(ago(2).getTime());
  });
});

describe("daysSince", () => {
  it("counts whole days", () => {
    expect(daysSince(NOW.getTime() - 36 * 60 * 60 * 1000, NOW)).toBe(1);
    expect(daysSince(ago(7).getTime(), NOW)).toBe(7);
  });

  it("returns 0 when there is no time", () => {
    expect(daysSince(null, NOW)).toBe(0);
  });

  it("never returns a negative number", () => {
    expect(daysSince(NOW.getTime() + DAY, NOW)).toBe(0);
  });
});

describe("buildQueue", () => {
  it("gives a fresh lead a priority equal to its score", () => {
    const [item] = buildQueue([makeLead({ score: 85 })], NOW);
    expect(item.priority).toBe(85);
    expect(item.daysSinceContact).toBe(0);
  });

  it("moves a promising lead that went quiet ahead of a fresher hot lead", () => {
    const quietWarm = makeLead({ _id: "warm", tag: "Warm", score: 60, createdAt: ago(10) });
    const freshHot = makeLead({ _id: "hot", tag: "Hot", score: 85, createdAt: ago(0) });
    const queue = buildQueue([freshHot, quietWarm], NOW);
    expect(queue[0].id).toBe("warm");
    expect(queue[0].priority).toBe(90);
    expect(queue[1].id).toBe("hot");
  });

  it("caps the staleness boost at 14 days", () => {
    const fourteen = buildQueue([makeLead({ tag: "Warm", score: 50, createdAt: ago(14) })], NOW);
    const thirty = buildQueue([makeLead({ tag: "Warm", score: 50, createdAt: ago(30) })], NOW);
    expect(fourteen[0].priority).toBe(92);
    expect(thirty[0].priority).toBe(92);
  });

  it("gives cold leads no boost", () => {
    const [item] = buildQueue([makeLead({ tag: "Cold", score: 20, createdAt: ago(20) })], NOW);
    expect(item.priority).toBe(20);
  });

  it("gives leads without analysis a fixed priority and a clear reason", () => {
    const [item] = buildQueue(
      [makeLead({ analysis: null, tag: "Unscored", score: 0, createdAt: ago(5) })],
      NOW
    );
    expect(item.priority).toBe(30);
    expect(item.tag).toBe("Unscored");
    expect(item.reason).toBe("AI analysis missing, re-run it");
  });

  it("resets the clock when a call is logged", () => {
    const lead = makeLead({ score: 80, createdAt: ago(20), debriefs: [{ at: ago(1) }] });
    const [item] = buildQueue([lead], NOW);
    expect(item.daysSinceContact).toBe(1);
    expect(item.priority).toBe(83);
  });

  it("breaks ties with the higher score", () => {
    const a = makeLead({ _id: "a", tag: "Hot", score: 80, createdAt: ago(0) });
    const b = makeLead({ _id: "b", tag: "Warm", score: 71, createdAt: ago(3) });
    const queue = buildQueue([b, a], NOW);
    expect(queue[0].priority).toBe(80);
    expect(queue[1].priority).toBe(80);
    expect(queue[0].id).toBe("a");
  });

  it("respects the limit", () => {
    const leads = Array.from({ length: 15 }, (_, i) =>
      makeLead({ _id: String(i), score: 50 + i })
    );
    expect(buildQueue(leads, NOW)).toHaveLength(10);
    expect(buildQueue(leads, NOW, 3)).toHaveLength(3);
  });

  it("writes a readable reason", () => {
    const today = buildQueue([makeLead({ createdAt: ago(0) })], NOW)[0];
    const one = buildQueue([makeLead({ createdAt: ago(1) })], NOW)[0];
    const five = buildQueue([makeLead({ createdAt: ago(5) })], NOW)[0];
    expect(today.reason).toBe("Hot lead, active today");
    expect(one.reason).toBe("Hot lead, no contact for 1 day");
    expect(five.reason).toBe("Hot lead, no contact for 5 days");
  });
});