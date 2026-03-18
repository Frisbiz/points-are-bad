"use client";

import { useMemo, useState } from "react";
import { formatKickoff } from "@/lib/format";
import { fixtureDeadline, fixtureIsLocked } from "@/lib/scoring";
import { Fixture, Pick } from "@/lib/types";

type Draft = {
  predictedHomeGoals: string;
  predictedAwayGoals: string;
  locked: boolean;
};

export function PicksPanel({
  fixtures,
  initialPicks,
  hasSubmitted,
  submissionCount,
  totalMembers,
}: {
  fixtures: Fixture[];
  initialPicks: Pick[];
  hasSubmitted: boolean;
  submissionCount: number;
  totalMembers: number;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const map: Record<string, Draft> = {};
    fixtures.forEach((fixture) => {
      const existing = initialPicks.find((p) => p.fixtureId === fixture.id);
      map[fixture.id] = {
        predictedHomeGoals:
          existing?.predictedHomeGoals.toString() ?? "",
        predictedAwayGoals:
          existing?.predictedAwayGoals.toString() ?? "",
        locked: fixtureIsLocked(fixture),
      };
    });
    return map;
  });
  const [status, setStatus] = useState<string | null>(
    hasSubmitted ? "Submitted for this matchweek." : null,
  );

  const completedCount = useMemo(
    () =>
      fixtures.filter((fixture) => {
        const draft = drafts[fixture.id];
        return draft?.predictedHomeGoals !== "" && draft?.predictedAwayGoals !== "";
      }).length,
    [drafts, fixtures],
  );

  const allComplete = completedCount === fixtures.length;
  const deadline = fixtureDeadline(fixtures);

  function updateDraft(
    fixtureId: string,
    field: "predictedHomeGoals" | "predictedAwayGoals",
    value: string,
  ) {
    setDrafts((prev) => ({
      ...prev,
      [fixtureId]: {
        ...prev[fixtureId],
        [field]: value.replace(/[^0-9]/g, "").slice(0, 2),
      },
    }));
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
            Picks
          </p>
          <h2 className="text-xl font-semibold">
            {completedCount} of {fixtures.length} picks completed
          </h2>
          {deadline && (
            <p className="text-sm text-slate-400">
              First kickoff locks picks: {formatKickoff(deadline.toISOString())}
            </p>
          )}
        </div>
        <div className="rounded-full border border-slate-800 px-4 py-2 text-sm text-slate-300">
          {submissionCount} of {totalMembers} submitted
        </div>
      </div>

      <div className="space-y-3">
        {fixtures.map((fixture) => {
          const draft = drafts[fixture.id];
          const locked = draft?.locked;
          const disabled = locked;
          return (
            <div
              key={fixture.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <p className="text-lg font-semibold">
                  <span className="underline decoration-brand-secondary">
                    {fixture.homeTeam}
                  </span>{" "}
                  vs {fixture.awayTeam}
                </p>
                <p className="text-sm text-slate-400">
                  {formatKickoff(fixture.kickoffTime)} • {fixture.status}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <NumberInput
                  label="Home"
                  value={draft?.predictedHomeGoals ?? ""}
                  onChange={(value) =>
                    updateDraft(
                      fixture.id,
                      "predictedHomeGoals",
                      value,
                    )
                  }
                  disabled={disabled}
                />
                <span className="text-sm text-slate-500">-</span>
                <NumberInput
                  label="Away"
                  value={draft?.predictedAwayGoals ?? ""}
                  onChange={(value) =>
                    updateDraft(
                      fixture.id,
                      "predictedAwayGoals",
                      value,
                    )
                  }
                  disabled={disabled}
                />
                {locked && (
                  <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
                    Locked
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          Auto-save enabled. Submit to reveal your group&apos;s picks.
        </p>
        <button
          disabled={!allComplete}
          onClick={() => {
            if (!allComplete) return;
            setStatus("Submitted. Replace with API call to /api/picks/submit.");
          }}
          className={`rounded-full px-5 py-3 text-sm font-semibold shadow transition ${
            allComplete
              ? "bg-gradient-to-r from-brand-primary to-brand-secondary text-slate-950 hover:opacity-90"
              : "cursor-not-allowed border border-slate-800 text-slate-400"
          }`}
        >
          Submit all picks
        </button>
      </div>
      {status && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
          {status}
        </div>
      )}
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="space-y-1 text-center text-xs text-slate-400">
      <span className="block">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-14 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-center text-sm text-slate-100 focus:border-brand-secondary focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-900/60"
        placeholder="0"
      />
    </label>
  );
}
