"use client";

import { useState } from "react";

export function GroupActions() {
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <aside className="card space-y-4">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
          Start
        </p>
        <h2 className="text-xl font-semibold">Create or join</h2>
      </div>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(
            "Group action is mocked for now. Wire this to /api/groups for persistence.",
          );
        }}
      >
        <label className="block space-y-1 text-sm">
          <span className="text-slate-300">Create group</span>
          <input
            type="text"
            placeholder="Group name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm focus:border-brand-secondary focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-full border border-brand-secondary/60 px-4 py-2 text-sm font-semibold text-brand-secondary transition hover:border-brand-secondary hover:bg-brand-secondary/10"
        >
          Create group
        </button>
      </form>
      <div className="border-t border-slate-800 pt-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(
              "Joining via invite is mocked. Connect this to /api/groups/join.",
            );
          }}
        >
          <label className="block space-y-1 text-sm">
            <span className="text-slate-300">Join with invite code</span>
            <input
              type="text"
              placeholder="e.g. NLD9JK"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm uppercase focus:border-brand-secondary focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary px-4 py-2 text-sm font-semibold text-slate-950 transition hover:opacity-90"
          >
            Join group
          </button>
        </form>
      </div>
      {message && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
          {message}
        </div>
      )}
    </aside>
  );
}
