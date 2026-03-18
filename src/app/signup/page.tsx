"use client";

import { useState } from "react";
import Link from "next/link";

export default function SignupPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="card space-y-3">
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="text-sm text-slate-400">
          Choose a display name, join a private group, and start predicting.
        </p>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setStatus(
              "Account created (placeholder). Connect this to your auth backend.",
            );
          }}
        >
          <label className="block space-y-1 text-sm">
            <span className="text-slate-300">Display name</span>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm focus:border-brand-secondary focus:outline-none"
              placeholder="Example: Casey"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-300">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm focus:border-brand-secondary focus:outline-none"
              placeholder="you@example.com"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-300">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm focus:border-brand-secondary focus:outline-none"
              placeholder="••••••••"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary px-4 py-2 font-semibold text-slate-950 transition hover:opacity-90"
          >
            Create account
          </button>
        </form>
        {status && (
          <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
            {status}
          </div>
        )}
      </div>
      <p className="text-center text-sm text-slate-400">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-secondary">
          Sign in
        </Link>
      </p>
    </div>
  );
}
