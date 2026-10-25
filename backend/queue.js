// Today's action queue.
// Ranks leads by how much they need attention today:
// the score (how promising the lead is) plus a boost for every day a
// promising lead has gone without contact. Pure functions, easy to test.

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_BOOST_PER_DAY = 3;
const MAX_STALE_DAYS = 14;
const MISSING_ANALYSIS_PRIORITY = 30;

// The last time anyone worked on the lead: when it was created,
// or when the most recent call was logged. Returns milliseconds or null.
export function lastTouchedAt(lead) {
  const times = [new Date(lead.createdAt).getTime()];
  for (const d of lead.debriefs || []) {
    times.push(new Date(d.at).getTime());
  }
  const valid = times.filter((t) => Number.isFinite(t));
  return valid.length ? Math.max(...valid) : null;
}

export function daysSince(timeMs, now = new Date()) {
  if (timeMs === null) return 0;
  return Math.max(0, Math.floor((now.getTime() - timeMs) / DAY_MS));
}

function describe(tag, days) {
  if (days === 0) return `${tag} lead, active today`;
  if (days === 1) return `${tag} lead, no contact for 1 day`;
  return `${tag} lead, no contact for ${days} days`;
}

export function buildQueue(leads, now = new Date(), limit = 10) {
  const items = leads.map((lead) => {
    const days = daysSince(lastTouchedAt(lead), now);

    // A lead saved while the AI was busy has no analysis yet.
    if (!lead.analysis) {
      return {
        id: String(lead._id),
        name: lead.name,
        tag: "Unscored",
        score: 0,
        priority: MISSING_ANALYSIS_PRIORITY,
        daysSinceContact: days,
        reason: "AI analysis missing, re-run it",
        nextAction: "",
      };
    }

    // Only promising leads get the "do not forget me" boost.
    const boost =
      lead.tag === "Cold" ? 0 : Math.min(days, MAX_STALE_DAYS) * STALE_BOOST_PER_DAY;

    return {
      id: String(lead._id),
      name: lead.name,
      tag: lead.tag,
      score: lead.score,
      priority: lead.score + boost,
      daysSinceContact: days,
      reason: describe(lead.tag, days),
      nextAction: lead.analysis.nextAction || "",
    };
  });

  return items
    .sort((a, b) => b.priority - a.priority || b.score - a.score)
    .slice(0, limit);
}