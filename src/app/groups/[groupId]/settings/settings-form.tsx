"use client";

import { useState } from "react";

export function SettingsForm({ initialDisplayName }: { initialDisplayName: string }) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(
            "Profile saved locally. Connect to your auth/profile API to persist.",
          );
        }}
      >
        <label className="block space-y-1 text-sm">
          <span className="text-slate-300">Display name</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm focus:border-brand-secondary focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary px-4 py-2 text-sm font-semibold text-slate-950 hover:opacity-90"
        >
          Save display name
        </button>
      </form>

      <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-3">
        <p className="text-sm font-semibold text-amber-200">Danger zone</p>
        <p className="text-sm text-slate-400">
          Leaving a group removes your picks from its leaderboards.
        </p>
        <button
          className="mt-3 rounded-full border border-rose-400/60 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:border-rose-300 hover:bg-rose-500/10"
          onClick={() =>
            setMessage(
              "Leaving group is mocked. Wire this to /api/groups/leave.",
            )
          }
        >
          Leave group
        </button>
      </div>

      {message && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
          {message}
        </div>
      )}
    </>
  );
}
