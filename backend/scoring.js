// Rule-based lead scoring.
// The AI only extracts facts ("signals") from the lead.
// This file turns those signals into a score, so the same
// signals always give the same score, and every point is explainable.

const TIMELINE_POINTS = { immediate: 25, short: 20, medium: 10, long: 3, unknown: 5 };
const BUDGET_POINTS = { specific: 20, vague: 10, none: 0 };
const REQUIREMENT_POINTS = { specific: 15, partial: 8, vague: 2 };
const ENGAGEMENT_POINTS = { ready_to_act: 25, interested: 12, browsing: 3 };
const OBJECTION_POINTS = { none: 15, minor: 8, major: 0 };

const APPROVAL_PENALTY = 5;
const SPAM_CAP = 10;

export const HOT_MIN = 75;
export const WARM_MIN = 45;

export function tagFromScore(score) {
  if (score >= HOT_MIN) return "Hot";
  if (score >= WARM_MIN) return "Warm";
  return "Cold";
}

// If the AI returns a value we do not know, fall back to a safe default.
function pick(table, value, fallback) {
  return Object.hasOwn(table, value) ? value : fallback;
}

// "ready_to_act" -> "ready to act" for display.
const label = (value) => String(value).replaceAll("_", " ");

export function computeScore(signals = {}) {
  const timeline = pick(TIMELINE_POINTS, signals.timeline, "unknown");
  const budget = pick(BUDGET_POINTS, signals.budget, "none");
  const requirement = pick(REQUIREMENT_POINTS, signals.requirement, "vague");
  const engagement = pick(ENGAGEMENT_POINTS, signals.engagement, "browsing");
  const objections = pick(OBJECTION_POINTS, signals.objections, "none");
  const needsApproval = signals.needsApproval === true;
  const isSpam = signals.isSpam === true;

  const breakdown = [
    { label: "Timeline", value: label(timeline), points: TIMELINE_POINTS[timeline], max: 25 },
    { label: "Budget", value: label(budget), points: BUDGET_POINTS[budget], max: 20 },
    { label: "Requirement", value: label(requirement), points: REQUIREMENT_POINTS[requirement], max: 15 },
    { label: "Engagement", value: label(engagement), points: ENGAGEMENT_POINTS[engagement], max: 25 },
    { label: "Objections", value: label(objections), points: OBJECTION_POINTS[objections], max: 15 },
  ];

  let score = breakdown.reduce((sum, item) => sum + item.points, 0);

  if (needsApproval) {
    score -= APPROVAL_PENALTY;
    breakdown.push({
      label: "Needs another person's approval",
      value: "yes",
      points: -APPROVAL_PENALTY,
      max: 0,
    });
  }

  if (isSpam) {
    score = Math.min(score, SPAM_CAP);
    breakdown.push({
      label: "Looks like spam or irrelevant",
      value: "yes",
      points: 0,
      max: 0,
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    tag: tagFromScore(score),
    breakdown,
    signals: { timeline, budget, requirement, engagement, objections, needsApproval, isSpam },
  };
}