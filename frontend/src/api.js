// In development the Vite proxy forwards /api to the backend.
// After deployment, VITE_API_URL points at the live backend.
const BASE = import.meta.env.VITE_API_URL || "";

/* ---------- Login token (kept in the browser) ---------- */

const TOKEN_KEY = "lead_token";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage can be blocked; the user simply has to log in again next time.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

// App.jsx registers a function here, so an expired login sends the
// user back to the login screen from anywhere in the app.
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

/* ---------- Requests ---------- */

async function request(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}/api${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  // A 401 on a normal request means the login expired.
  // (A 401 on the login form just means a wrong password.)
  if (res.status === 401 && token && !path.startsWith("/auth/")) {
    clearToken();
    onUnauthorized();
  }

  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/* ---------- Auth ---------- */

export const registerUser = (name, email, password) =>
  request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });

export const loginUser = (email, password) =>
  request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const getMe = () => request("/auth/me");

/* ---------- Leads ---------- */

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