import { useState } from "react";
import { loginUser, registerUser, setToken } from "./api.js";
import "./AuthScreen.css";

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  function switchMode(next) {
    setMode(next);
    setError("");
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = isRegister
        ? await registerUser(name, email, password)
        : await loginUser(email, password);
      setToken(data.token);
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Lead Prioritizer</h1>
        <p className="auth-sub">AI-ranked real-estate leads for your sales team</p>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${!isRegister ? "active" : ""}`}
            onClick={() => switchMode("login")}
          >
            Log in
          </button>
          <button
            type="button"
            className={`auth-tab ${isRegister ? "active" : ""}`}
            onClick={() => switchMode("register")}
          >
            Create account
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        <form className="form" onSubmit={submit}>
          {isRegister && (
            <label>
              Name
              <input
                required
                value={name}
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label>
            Email
            <input
              required
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              minLength={isRegister ? 8 : undefined}
              value={password}
              autoComplete={isRegister ? "new-password" : "current-password"}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {isRegister && <p className="auth-hint">Use at least 8 characters.</p>}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Please wait..." : isRegister ? "Create account" : "Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}