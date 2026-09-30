import { useEffect, useMemo, useState } from "react";
import { getLeads, createLead, deleteLead } from "./api.js";
import LeadDetail, { TagPill } from "./LeadDetail.jsx";

const EMPTY = {
  name: "",
  location: "",
  requirement: "",
  budget: "",
  timeline: "1-3 months",
  message: "",
};

const TIMELINES = [
  "Immediately",
  "Within 1 month",
  "1-3 months",
  "3-6 months",
  "6+ months",
  "Just exploring",
];

const SAMPLE = {
  name: "Priya Sharma",
  location: "Bhopal",
  requirement: "2BHK flat near Arera Colony",
  budget: "45 lakh",
  timeline: "Within 1 month",
  message:
    "Hi, I saw your listing for the 2BHK near Arera Colony. My family is shifting to Bhopal next month for my husband's job. We need a ready flat with parking. Can we visit this weekend? Is the price negotiable?",
};

const FILTERS = ["All", "Hot", "Warm", "Cold"];

export default function App() {
  const [leads, setLeads] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("All");
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getLeads()
      .then((data) => {
        setLeads(data);
        if (data.length) setSelectedId(data[0]._id);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Highest score first, always.
  const sorted = useMemo(
    () => [...leads].sort((a, b) => b.score - a.score),
    [leads]
  );

  const counts = useMemo(() => {
    const c = { All: leads.length, Hot: 0, Warm: 0, Cold: 0 };
    leads.forEach((l) => {
      if (c[l.tag] !== undefined) c[l.tag] += 1;
    });
    return c;
  }, [leads]);

  const visible = filter === "All" ? sorted : sorted.filter((l) => l.tag === filter);
  const selected = leads.find((l) => l._id === selectedId) || null;

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const lead = await createLead(form);
      setLeads((prev) => [lead, ...prev]);
      setSelectedId(lead._id);
      setFilter("All");
      setForm(EMPTY);
      setShowForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleUpdate(updated) {
    setLeads((prev) => prev.map((l) => (l._id === updated._id ? updated : l)));
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this lead?")) return;
    try {
      await deleteLead(id);
      const rest = leads.filter((l) => l._id !== id);
      setLeads(rest);
      setSelectedId(rest.length ? rest[0]._id : null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <header className="app-header">
        <h1>Lead Prioritizer</h1>
        <span>AI-ranked real-estate leads</span>
      </header>

      <div className="layout">
        <div className="panel">
          <button
            className="btn btn-primary"
            onClick={() => setShowForm((s) => !s)}
            style={{ width: "100%" }}
          >
            {showForm ? "Close form" : "+ New lead"}
          </button>

          {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

          {showForm && (
            <form className="form" onSubmit={handleSubmit}>
              <label>
                Name
                <input
                  required
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                />
              </label>
              <div className="form-row">
                <label>
                  Location
                  <input
                    value={form.location}
                    onChange={(e) => setField("location", e.target.value)}
                  />
                </label>
                <label>
                  Budget
                  <input
                    value={form.budget}
                    placeholder="e.g. 60 lakh"
                    onChange={(e) => setField("budget", e.target.value)}
                  />
                </label>
              </div>
              <label>
                Property requirement
                <input
                  value={form.requirement}
                  placeholder="e.g. 3BHK apartment"
                  onChange={(e) => setField("requirement", e.target.value)}
                />
              </label>
              <label>
                Buying timeline
                <select
                  value={form.timeline}
                  onChange={(e) => setField("timeline", e.target.value)}
                >
                  {TIMELINES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Customer message
                <textarea
                  required
                  value={form.message}
                  placeholder="Paste the inquiry or chat transcript"
                  onChange={(e) => setField("message", e.target.value)}
                />
              </label>
              <div className="form-actions">
                <button className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Analyzing with AI..." : "Save and analyze"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setForm(SAMPLE)}
                  disabled={submitting}
                >
                  Fill sample
                </button>
              </div>
            </form>
          )}

          <div className="filters">
            {FILTERS.map((f) => (
              <button
                key={f}
                className={`filter ${filter === f ? "active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f} ({counts[f]})
              </button>
            ))}
          </div>

          <div className="lead-list">
            {loading && <div className="empty">Loading leads...</div>}
            {!loading && visible.length === 0 && (
              <div className="empty">No leads here yet.</div>
            )}
            {visible.map((lead) => (
              <div
                key={lead._id}
                className={`lead-item ${lead._id === selectedId ? "selected" : ""}`}
                onClick={() => setSelectedId(lead._id)}
              >
                <div className="lead-item-top">
                  <span className="lead-item-name">{lead.name}</span>
                  <span>
                    <span className="score">{lead.analysis ? lead.score : "-"}</span>{" "}
                    <TagPill tag={lead.tag} />
                  </span>
                </div>
                <div className="lead-item-meta">
                  {[lead.location, lead.requirement].filter(Boolean).join(" · ")}
                </div>
                {lead.analysis && (
                  <div className="lead-item-summary">{lead.analysis.summary}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          {selected ? (
            <LeadDetail
              key={selected._id}
              lead={selected}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ) : (
            <div className="panel empty">
              Select a lead, or add a new one to see the AI analysis.
            </div>
          )}
        </div>
      </div>
    </>
  );
}