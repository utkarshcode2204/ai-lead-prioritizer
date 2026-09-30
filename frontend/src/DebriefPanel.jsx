import { useState } from "react";
import { debriefLead } from "./api.js";
import "./DebriefPanel.css";

const SAMPLE_NOTES =
  "Spoke for 10 minutes. He liked the ready-to-move flats but said his real budget is 50 lakh, not 60. Wants to visit this Sunday if we have something in range. His wife still needs to approve.";

function FollowUp({ text }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <div className="debrief-label">Follow-up message</div>
      <div className="reply-box" style={{ marginTop: 4 }}>{text}</div>
      <button
        className="btn btn-small"
        style={{ marginTop: 6 }}
        onClick={copy}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </>
  );
}

export default function DebriefPanel({ lead, onUpdate }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const history = [...(lead.debriefs || [])].reverse();

  async function submit() {
    if (!notes.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await debriefLead(lead._id, notes.trim());
      onUpdate(updated);
      setNotes("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="debrief card wide">
      <h3>Post-call debrief</h3>
      <p className="debrief-hint">
        Just spoke to {lead.name}? Paste your call notes. The AI will re-score the
        lead, explain what changed, and draft a follow-up.
      </p>

      {error && <div className="error">{error}</div>}

      <textarea
        value={notes}
        placeholder="e.g. He said his real budget is lower, wants a site visit on Sunday..."
        onChange={(e) => setNotes(e.target.value)}
        disabled={busy}
      />

      <div className="debrief-actions">
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={busy || !notes.trim()}
        >
          {busy ? "Updating lead..." : "Update lead from call"}
        </button>
        <button
          className="btn"
          onClick={() => setNotes(SAMPLE_NOTES)}
          disabled={busy}
        >
          Fill sample notes
        </button>
      </div>

      {history.length > 0 && (
        <div className="debrief-history">
          {history.map((d, i) => {
            const diff = d.scoreAfter - d.scoreBefore;
            return (
              <div className="debrief-entry" key={d._id || i}>
                <div className="debrief-change">
                  <span>{d.scoreBefore}</span>
                  <span className="debrief-arrow">→</span>
                  <span>{d.scoreAfter}</span>
                  <span className={diff >= 0 ? "debrief-up" : "debrief-down"}>
                    ({diff >= 0 ? "+" : ""}{diff})
                  </span>
                </div>
                <p>{d.changeSummary}</p>
                <div className="debrief-label">Your call notes</div>
                <p>{d.notes}</p>
                <FollowUp text={d.followUpMessage} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}