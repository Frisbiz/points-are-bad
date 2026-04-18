"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  return (
    <motion.div
      className="mx-auto max-w-md space-y-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
    >
      <div className="card space-y-3">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-slate-400">
          Private friend groups only. Use the invite link or code you received.
        </p>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setStatus("Signed in (placeholder). Wire this to your auth provider.");
          }}
        >
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
            Continue
          </button>
        </form>
        {status && (
          <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
            {status}
          </div>
        )}
      </div>
      <p className="text-center text-sm text-slate-400">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-brand-secondary">
          Create an account
        </Link>
      </p>
    </motion.div>
  );
}
