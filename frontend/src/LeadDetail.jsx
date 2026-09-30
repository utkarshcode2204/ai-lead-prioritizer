import { useState } from "react";
import { reanalyzeLead } from "./api.js";
import ChatPanel from "./ChatPanel.jsx";
import DebriefPanel from "./DebriefPanel.jsx";

export function TagPill({ tag }) {
  return <span className={`tag tag-${tag.toLowerCase()}`}>{tag}</span>;
}

export default function LeadDetail({ lead, onUpdate, onDelete }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const a = lead.analysis;

  async function retry() {
    setBusy(true);
    setError("");
    try {
      onUpdate(await reanalyzeLead(lead._id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyReply() {
    await navigator.clipboard.writeText(a.suggestedResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="panel">
      <div className="detail-head">
        <div>
          <h2>{lead.name}</h2>
          <div className="detail-meta">
            {[lead.location, lead.requirement, lead.budget, lead.timeline]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        {a && (
          <div className="score-box">
            <TagPill tag={lead.tag} />
            <div className="score-big">{lead.score}</div>
            <div className="score-reason">{a.scoreReason}</div>
          </div>
        )}
      </div>

      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

      {!a ? (
        <div className="empty">
          <p>The AI analysis is not available for this lead yet.</p>
          <button className="btn btn-primary" onClick={retry} disabled={busy}>
            {busy ? "Analyzing..." : "Analyze with AI"}
          </button>
        </div>
      ) : (
        <>
          <div className="grid">
            <div className="card action wide">
              <h3>Recommended next action</h3>
              <p>{a.nextAction}</p>
            </div>

            <div className="card">
              <h3>Summary</h3>
              <p>{a.summary}</p>
            </div>

            <div className="card">
              <h3>Customer intent</h3>
              <p>{a.intent}</p>
            </div>

            <div className="card">
              <h3>Key requirements</h3>
              <div className="chips">
                {a.keyRequirements.map((r, i) => (
                  <span className="chip" key={i}>{r}</span>
                ))}
              </div>
            </div>

            <div className="card">
              <h3>Objections / concerns</h3>
              <div className="chips">
                {a.objections.length === 0 && <span className="chip">None raised</span>}
                {a.objections.map((o, i) => (
                  <span className="chip objection" key={i}>{o}</span>
                ))}
              </div>
            </div>

            <div className="card wide">
              <div className="card-head">
                <h3>Suggested response to the customer</h3>
                <button className="btn btn-small" onClick={copyReply}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="reply-box">{a.suggestedResponse}</div>
            </div>
          </div>

          <DebriefPanel lead={lead} onUpdate={onUpdate} />
          <ChatPanel lead={lead} onUpdate={onUpdate} />
        </>
      )}

      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        {a && (
          <button className="btn btn-small" onClick={retry} disabled={busy}>
            {busy ? "Analyzing..." : "Re-run analysis"}
          </button>
        )}
        <button className="btn btn-small btn-danger" onClick={() => onDelete(lead._id)}>
          Delete lead
        </button>
      </div>
    </div>
  );
}