"use client";

import { motion, useInView, AnimatePresence } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import Link from "next/link";

// ─── Phase cycling for the demo card ─────────────────────────────────────────

const PHASES = ["open", "locked", "result", "score"] as const;
type Phase = (typeof PHASES)[number];

const PHASE_MS: Record<Phase, number> = {
  open: 2800,
  locked: 1200,
  result: 2000,
  score: 3200,
};

// ─── Score cell ───────────────────────────────────────────────────────────────

function ScoreCell({
  value,
  accent,
  dim,
}: {
  value: string;
  accent: "teal" | "pink";
  dim?: boolean;
}) {
  const border =
    accent === "teal" ? "border-[#3DD6D0]/25" : "border-[#E5446D]/25";
  const text =
    accent === "teal" ? "text-[#3DD6D0]" : "text-[#E5446D]";
  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-xl border ${border} bg-slate-800/90 text-2xl font-bold tabular-nums ${text} transition-opacity duration-500`}
      style={{ opacity: dim ? 0.45 : 1 }}
    >
      {value}
    </div>
  );
}

// ─── Animated prediction demo ─────────────────────────────────────────────────

function PredictionDemo() {
  const [phase, setPhase] = useState<Phase>("open");
  const phaseIndex = useRef(0);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      phaseIndex.current = (phaseIndex.current + 1) % PHASES.length;
      const next = PHASES[phaseIndex.current];
      setPhase(next);
      t = setTimeout(tick, PHASE_MS[next]);
    };
    t = setTimeout(tick, PHASE_MS["open"]);
    return () => clearTimeout(t);
  }, []);

  const badgeStyle: Record<Phase, string> = {
    open: "bg-[#3DD6D0]/10 text-[#3DD6D0] border-[#3DD6D0]/25",
    locked: "bg-amber-500/10 text-amber-300 border-amber-500/25",
    result: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
    score: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  };
  const badgeLabel: Record<Phase, string> = {
    open: "Open",
    locked: "Locked",
    result: "Final",
    score: "Final",
  };

  return (
    <motion.div
      className="relative w-full max-w-[22rem]"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -inset-10 rounded-full bg-[#3DD6D0]/5 blur-3xl" />

      <div className="relative rounded-2xl border border-slate-700/50 bg-slate-900/85 p-6 shadow-2xl shadow-black/60 backdrop-blur-sm ring-1 ring-white/[0.04]">
        {/* Header row */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Matchweek 32
            </p>
            <p className="mt-0.5 font-semibold text-slate-100">
              Arsenal vs Tottenham
            </p>
            <p className="text-xs text-slate-500">Sat 15 Apr · 12:30</p>
          </div>
          <motion.span
            key={badgeLabel[phase]}
            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badgeStyle[phase]}`}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            {badgeLabel[phase]}
          </motion.span>
        </div>

        {/* Score boxes */}
        <div className="mb-5 flex items-center justify-center gap-8">
          {/* Pick */}
          <div className="space-y-2 text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Your pick
            </p>
            <div className="flex items-center gap-1.5">
              <ScoreCell value="2" accent="teal" dim={phase !== "open"} />
              <span className="text-slate-600">—</span>
              <ScoreCell value="1" accent="teal" dim={phase !== "open"} />
            </div>
          </div>

          {/* Actual result */}
          <AnimatePresence>
            {(phase === "result" || phase === "score") && (
              <motion.div
                className="space-y-2 text-center"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 14 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  Actual
                </p>
                <div className="flex items-center gap-1.5">
                  <ScoreCell value="3" accent="pink" />
                  <span className="text-slate-600">—</span>
                  <ScoreCell value="1" accent="pink" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Locked notice */}
        <AnimatePresence>
          {phase === "locked" && (
            <motion.p
              className="mb-4 flex items-center justify-center gap-1.5 text-xs text-amber-400/80"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <svg
                className="h-3.5 w-3.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                  clipRule="evenodd"
                />
              </svg>
              Picks locked at kickoff
            </motion.p>
          )}
        </AnimatePresence>

        {/* Score breakdown */}
        <AnimatePresence>
          {phase === "score" && (
            <motion.div
              className="overflow-hidden rounded-xl border border-slate-700/40 bg-slate-950/70 px-4 py-3"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="mb-2 text-center font-mono text-sm text-slate-300">
                <span className="text-[#3DD6D0]">|2−3|</span>
                <span className="text-slate-500"> + </span>
                <span className="text-[#E5446D]">|1−1|</span>
                <span className="text-slate-500"> = </span>
                <span className="font-bold text-[#3DD6D0]">1</span>
                <span className="text-slate-500"> + </span>
                <span className="font-bold text-[#E5446D]">0</span>
              </p>
              <motion.p
                className="text-center text-2xl font-bold text-[#3DD6D0]"
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.22, duration: 0.3 }}
              >
                1 point
              </motion.p>
              <p className="mt-0.5 text-center text-[10px] uppercase tracking-widest text-slate-500">
                Lower is better
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Scroll-triggered fade-up wrapper ────────────────────────────────────────

function FadeUp({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ─── Landing page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="space-y-28 pb-20">
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative grid min-h-[85vh] items-center gap-16 lg:grid-cols-2">
        {/* Dot-grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-100"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Left: copy */}
        <div className="relative space-y-8 py-16 lg:py-0">
          <motion.p
            className="text-xs uppercase tracking-[0.35em] text-[#3DD6D0]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            Premier League · Score Predictions
          </motion.p>

          <div className="space-y-0.5">
            {(
              [
                { text: "PREDICT.", color: "#F1F5F9" },
                { text: "SUFFER.", color: "#3DD6D0" },
                { text: "WIN.", color: "#E5446D" },
              ] as const
            ).map(({ text, color }, i) => (
              <motion.div
                key={text}
                className="block font-bold leading-[0.9] tracking-tight"
                style={{
                  color,
                  fontSize: "clamp(3.5rem, 9vw, 6.5rem)",
                }}
                initial={{ opacity: 0, y: 44, skewY: 2 }}
                animate={{ opacity: 1, y: 0, skewY: 0 }}
                transition={{
                  duration: 0.6,
                  delay: 0.06 + i * 0.12,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {text}
              </motion.div>
            ))}
          </div>

          <motion.p
            className="max-w-sm text-base leading-relaxed text-slate-300"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            A Premier League score prediction game for friend groups. Every goal
            off costs a point. Lowest total wins. It&apos;s harder than it
            sounds.
          </motion.p>

          <motion.div
            className="flex flex-wrap gap-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.5 }}
          >
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#E5446D] to-[#3DD6D0] px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-[#E5446D]/25 transition-all duration-200 hover:scale-[1.03] hover:shadow-[#E5446D]/40"
            >
              Create a group
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                />
              </svg>
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 transition-all duration-200 hover:border-[#3DD6D0]/60 hover:text-[#3DD6D0]"
            >
              Sign in
            </Link>
          </motion.div>

          <motion.div
            className="flex gap-8 border-t border-slate-800 pt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.85, duration: 0.5 }}
          >
            {[
              { n: "0", label: "Points for a perfect pick" },
              { n: "20+", label: "Fixtures per matchweek" },
              { n: "Free", label: "Always and forever" },
            ].map(({ n, label }) => (
              <div key={label}>
                <p className="text-xl font-bold text-[#3DD6D0]">{n}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                  {label}
                </p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Right: demo card */}
        <div className="flex justify-center lg:justify-end">
          <PredictionDemo />
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="space-y-12">
        <FadeUp className="text-center">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-[#3DD6D0]">
            The game
          </p>
          <h2 className="text-3xl font-bold sm:text-4xl">
            Three steps. No luck.
          </h2>
        </FadeUp>

        <div className="grid gap-5 sm:grid-cols-3">
          {[
            {
              num: "01",
              title: "Create or join a group",
              body: "Share an invite code with your friends. Everyone in the group sees the same fixtures and plays together.",
            },
            {
              num: "02",
              title: "Predict every scoreline",
              body: "Submit exact scores for all fixtures before kickoff. Your picks stay hidden from everyone else until you lock them all in.",
            },
            {
              num: "03",
              title: "Lowest points wins",
              body: "Points are goals off from reality. Zero is perfection. Track season standings on the leaderboard.",
            },
          ].map((step, i) => (
            <FadeUp key={step.num} delay={i * 0.1}>
              <div className="card group relative h-full overflow-hidden transition-all duration-300 hover:border-slate-700 hover:shadow-lg hover:shadow-black/30">
                <div className="absolute left-0 top-0 h-full w-0.5 rounded-l-2xl bg-gradient-to-b from-[#3DD6D0]/50 to-transparent" />
                <p className="mb-4 font-mono text-4xl font-bold text-[#3DD6D0]/20 transition-colors duration-300 group-hover:text-[#3DD6D0]/40">
                  {step.num}
                </p>
                <h3 className="mb-2 font-semibold text-slate-100">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-400">
                  {step.body}
                </p>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── SCORING ──────────────────────────────────────────────────────── */}
      <FadeUp>
        <section className="card relative overflow-hidden">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#E5446D]/5 blur-3xl" />
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.3em] text-[#3DD6D0]">
                Scoring
              </p>
              <h2 className="text-2xl font-bold leading-snug sm:text-3xl">
                Points = goals off.
                <br />
                Simple. Brutal.
              </h2>
              <p className="text-slate-300">
                For each fixture, count how many goals off you were on each side
                and add them together. Zero means a perfect scoreline.
              </p>
              <p className="text-sm text-slate-400">
                A 2−1 prediction on a 3−1 result is just 1 point. A 0−0
                prediction on a 4−3 result is 7 points. Precision is
                everything.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-700/50 bg-slate-950/80 p-5">
              <p className="mb-4 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Formula
              </p>
              <p className="mb-5 font-mono text-lg font-bold text-slate-200">
                pts ={" "}
                <span className="text-[#3DD6D0]">|pH − aH|</span> +{" "}
                <span className="text-[#E5446D]">|pA − aA|</span>
              </p>
              <div className="mb-5 space-y-1 text-xs text-slate-400">
                <p>
                  <span className="text-[#3DD6D0]">pH / aH</span> = predicted /
                  actual home goals
                </p>
                <p>
                  <span className="text-[#E5446D]">pA / aA</span> = predicted /
                  actual away goals
                </p>
              </div>
              <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3 font-mono text-sm">
                <span className="text-slate-400">
                  predict 2−1, actual 3−1 →{" "}
                </span>
                <span className="text-[#3DD6D0]">|2−3|</span>
                <span className="text-slate-500"> + </span>
                <span className="text-[#E5446D]">|1−1|</span>
                <span className="text-slate-400"> = </span>
                <span className="font-bold text-white">1 pt</span>
              </div>
            </div>
          </div>
        </section>
      </FadeUp>

      {/* ── FEATURES ─────────────────────────────────────────────────────── */}
      <section className="space-y-12">
        <FadeUp className="text-center">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-[#3DD6D0]">
            Features
          </p>
          <h2 className="text-3xl font-bold sm:text-4xl">
            Built for competitive friends
          </h2>
        </FadeUp>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                  />
                </svg>
              ),
              title: "Hidden picks",
              body: "No one sees your predictions until you lock them all in. No copying, no last-minute adjustments.",
            },
            {
              icon: (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                  />
                </svg>
              ),
              title: "Auto-lock at kickoff",
              body: "Picks fix the second the match starts. No backdating, no excuses, no cheating.",
            },
            {
              icon: (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12"
                  />
                </svg>
              ),
              title: "Inverted leaderboard",
              body: "Lowest points wins. The board rewards accuracy across every matchweek of the season.",
            },
            {
              icon: (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                  />
                </svg>
              ),
              title: "Private groups",
              body: "Invite-only with a share code. Just you and your friends — no strangers, no noise.",
            },
          ].map((feat, i) => (
            <FadeUp key={feat.title} delay={i * 0.08}>
              <div className="card group h-full space-y-3 transition-all duration-300 hover:border-slate-700 hover:shadow-lg hover:shadow-black/20">
                <div className="inline-flex rounded-lg border border-slate-700/50 bg-slate-800/60 p-2.5 text-[#3DD6D0] transition-all duration-300 group-hover:border-[#3DD6D0]/30 group-hover:bg-[#3DD6D0]/10">
                  {feat.icon}
                </div>
                <h3 className="font-semibold text-slate-100">{feat.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">
                  {feat.body}
                </p>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────── */}
      <FadeUp>
        <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60 p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(61,214,208,0.07),transparent_55%)]" />
          <div className="relative space-y-5">
            <h2 className="text-3xl font-bold sm:text-5xl">
              Your group is{" "}
              <span className="bg-gradient-to-r from-[#E5446D] to-[#3DD6D0] bg-clip-text text-transparent">
                one invite away.
              </span>
            </h2>
            <p className="mx-auto max-w-sm text-base text-slate-300">
              Takes two minutes to set up. You already know who you want to
              beat.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#E5446D] to-[#3DD6D0] px-8 py-3.5 text-base font-semibold text-slate-950 shadow-lg shadow-[#E5446D]/25 transition-all duration-200 hover:scale-[1.03] hover:shadow-[#E5446D]/40"
              >
                Create a group — it&apos;s free
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                  />
                </svg>
              </Link>
            </div>
            <p className="text-xs text-slate-500">
              No credit card. No ads. Just points. (Which are bad.)
            </p>
          </div>
        </section>
      </FadeUp>
    </div>
  );
}
