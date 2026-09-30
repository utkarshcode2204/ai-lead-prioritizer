// In development the Vite proxy forwards /api to the backend.
// After deployment, VITE_API_URL points at the live backend.
const BASE = import.meta.env.VITE_API_URL || "";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const getLeads = () => request("/leads");

export const createLead = (lead) =>
  request("/leads", { method: "POST", body: JSON.stringify(lead) });

export const reanalyzeLead = (id) =>
  request(`/leads/${id}/reanalyze`, { method: "POST" });

export const deleteLead = (id) => request(`/leads/${id}`, { method: "DELETE" });

export const chatWithLead = (id, message) =>
  request(`/leads/${id}/chat`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });

export const debriefLead = (id, notes) =>
  request(`/leads/${id}/debrief`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  });