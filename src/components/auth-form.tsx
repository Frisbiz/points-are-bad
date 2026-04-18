"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

interface AuthFormProps {
  mode: "login" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "signup") {
      if (password !== confirmPassword) { setError("Passwords do not match."); return; }
      setStatus("Account created (placeholder). Connect this to your auth backend.");
    } else {
      setStatus("Signed in (placeholder). Wire this to your auth provider.");
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", background: "var(--bg)",
    border: "1px solid var(--border2)", borderRadius: 8, fontSize: 13,
    color: "var(--text)", fontFamily: "'DM Mono', monospace", outline: "none",
    transition: "border-color 0.15s",
  };

  return (
    <div
      className="index-grid-bg"
      style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "96px 24px 24px" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
        style={{ width: "100%", maxWidth: 860, display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 36, alignItems: "center", position: "relative", zIndex: 1 }}
        className="auth-grid"
      >
        {/* Branding */}
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: "Inter, system-ui, sans-serif", fontWeight: 800, fontSize: "clamp(2.4rem, 5vw, 4rem)", color: "var(--text-bright)", letterSpacing: "-0.04em", lineHeight: 1.02 }}>POINTS</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 400, fontSize: 13, color: "var(--text-dim)", letterSpacing: 3 }}>are bad</span>
          </div>
          <div style={{ fontSize: 14, color: "var(--text-dim)", letterSpacing: 0.2, marginTop: 10, lineHeight: 1.6 }}>
            Pick scores. Take the damage. Lowest total wins.
          </div>
        </div>

        {/* Form card */}
        <div>
          <div className="liquid-card" style={{ borderRadius: 28, padding: 32, position: "relative", zIndex: 1 }}>
            {/* Tab switcher */}
            <div style={{ display: "flex", background: "var(--bg)", borderRadius: 14, padding: 3, marginBottom: 28, gap: 3 }}>
              <Link
                href="/login"
                style={{
                  flex: 1, display: "block", textAlign: "center", padding: "8px 0",
                  background: mode === "login" ? "var(--btn-bg)" : "transparent",
                  color: mode === "login" ? "var(--btn-text)" : "var(--text-dim2)",
                  borderRadius: 10, fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
                  fontFamily: "'DM Mono', monospace", fontWeight: 500, textDecoration: "none",
                  transition: "all 0.2s",
                }}
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                style={{
                  flex: 1, display: "block", textAlign: "center", padding: "8px 0",
                  background: mode === "signup" ? "var(--btn-bg)" : "transparent",
                  color: mode === "signup" ? "var(--btn-text)" : "var(--text-dim2)",
                  borderRadius: 10, fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
                  fontFamily: "'DM Mono', monospace", fontWeight: 500, textDecoration: "none",
                  transition: "all 0.2s",
                }}
              >
                Sign Up
              </Link>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {mode === "signup" && (
                <input
                  type="text" required placeholder="Display name"
                  value={username} onChange={e => setUsername(e.target.value)}
                  style={inputStyle}
                />
              )}
              <input
                type="email" required placeholder="Email"
                value={email} onChange={e => setEmail(e.target.value)}
                style={inputStyle}
              />
              <input
                type="password" required placeholder="Password"
                value={password} onChange={e => setPassword(e.target.value)}
                style={inputStyle}
              />
              {mode === "signup" && (
                <input
                  type="password" required placeholder="Confirm password"
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  style={inputStyle}
                />
              )}
              {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
              {status && <div style={{ color: "#22c55e", fontSize: 12 }}>{status}</div>}
              <button
                type="submit"
                style={{
                  width: "100%", marginTop: 8, padding: "12px 0",
                  background: "var(--btn-bg)", color: "var(--btn-text)",
                  border: "none", borderRadius: 10, cursor: "pointer",
                  fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
                  fontFamily: "'DM Mono', monospace", fontWeight: 500,
                }}
              >
                {mode === "login" ? "Sign In" : "Create Account"}
              </button>
            </form>
          </div>

          <button
            style={{
              width: "100%", marginTop: 12, padding: "11px 0",
              background: "transparent", border: "1px solid var(--border2)", borderRadius: 14,
              color: "var(--text-dim)", cursor: "pointer", fontSize: 13,
              fontFamily: "Inter, system-ui, sans-serif", fontWeight: 500,
              transition: "border-color 0.2s, color 0.2s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--text-dim)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border2)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)"; }}
          >
            Try demo
          </button>
        </div>
      </motion.div>

      <style>{`
        @media (max-width: 620px) {
          .auth-grid { grid-template-columns: 1fr !important; }
        }
        input:focus { border-color: var(--text-mid) !important; }
      `}</style>
    </div>
  );
}
