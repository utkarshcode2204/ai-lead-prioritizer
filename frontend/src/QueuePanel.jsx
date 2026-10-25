import { useEffect, useState } from "react";
import { getQueue } from "./api.js";
import { TagPill } from "./LeadDetail.jsx";
import "./QueuePanel.css";

const SHOWN = 5;

export default function QueuePanel({ refreshKey, onSelect }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  // Reload whenever the leads change (new lead, new call, deleted lead).
  useEffect(() => {
    let cancelled = false;
    getQueue()
      .then((data) => {
        if (!cancelled) {
          setItems(data);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <div className="queue">
      <div className="queue-head">
        <h3>Today's queue</h3>
        <span>who to call first</span>
      </div>

      {error && <div className="queue-note">{error}</div>}
      {!error && items === null && <div className="queue-note">Loading...</div>}
      {!error && items && items.length === 0 && (
        <div className="queue-note">No leads yet. Add one to build your queue.</div>
      )}

      <div className="queue-list">
        {(items || []).slice(0, SHOWN).map((item, index) => (
          <div className="queue-item" key={item.id} onClick={() => onSelect(item.id)}>
            <span className="queue-rank">{index + 1}</span>
            <div className="queue-main">
              <div className="queue-top">
                <span className="queue-name">{item.name}</span>
                <TagPill tag={item.tag} />
              </div>
              <div className="queue-reason">
                {item.reason} · priority {item.priority}
              </div>
              {item.nextAction && <div className="queue-action">{item.nextAction}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}