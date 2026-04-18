"use client";

import { motion, useInView, AnimatePresence } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import Link from "next/link";

function FadeIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div
      ref={ref}
      style={style}
      initial={{ opacity: 0, y: 6 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.25, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

// ─── Prediction demo ──────────────────────────────────────────────────────────

const PHASES = ["open", "locked", "result", "score"] as const;
type Phase = (typeof PHASES)[number];
const PHASE_MS: Record<Phase, number> = { open: 2800, locked: 1200, result: 2000, score: 3200 };

function PredictionDemo() {
  const [phase, setPhase] = useState<Phase>("open");
  const idx = useRef(0);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      idx.current = (idx.current + 1) % PHASES.length;
      const next = PHASES[idx.current];
      setPhase(next);
      t = setTimeout(tick, PHASE_MS[next]);
    };
    t = setTimeout(tick, PHASE_MS.open);
    return () => clearTimeout(t);
  }, []);

  const statusLabel = { open: "OPEN", locked: "LOCKED", result: "FINAL", score: "FINAL" }[phase];
  const statusColor = {
    open:   { color: "#22c55e", bg: "#22c55e15", border: "#22c55e25" },
    locked: { color: "#f59e0b", bg: "#f59e0b15", border: "#f59e0b25" },
    result: { color: "#e8e4d9", bg: "#e8e4d910", border: "#e8e4d920" },
    score:  { color: "#e8e4d9", bg: "#e8e4d910", border: "#e8e4d920" },
  }[phase];

  const scoreCell = (val: string, dim?: boolean) => (
    <div style={{
      width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)", border: "1px solid var(--border2)", borderRadius: 8,
      fontSize: 22, fontWeight: 500, fontFamily: "'DM Mono', monospace",
      color: "var(--text-bright)", opacity: dim ? 0.45 : 1, transition: "opacity 0.4s",
    }}>{val}</div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.25, ease: "easeOut" }}
      style={{ width: "100%", maxWidth: 340 }}
    >
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 14,
        padding: 24, fontFamily: "'DM Mono', monospace",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: 3, textTransform: "uppercase", marginBottom: 5 }}>Matchweek 32</div>
            <div style={{ fontSize: 14, color: "var(--text-bright)", fontWeight: 500 }}>Arsenal vs Tottenham</div>
            <div style={{ fontSize: 10, color: "var(--text-dim2)", marginTop: 2 }}>Sat 15 Apr · 12:30</div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={statusLabel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                fontSize: 9, letterSpacing: 2, fontWeight: 500, padding: "3px 9px",
                borderRadius: 4, border: `1px solid ${statusColor.border}`,
                background: statusColor.bg, color: statusColor.color,
              }}
            >
              {statusLabel}
            </motion.div>
          </AnimatePresence>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Your pick</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {scoreCell("2", phase !== "open")}
              <span style={{ color: "var(--text-dim)", fontSize: 14 }}>–</span>
              {scoreCell("1", phase !== "open")}
            </div>
          </div>

          <AnimatePresence>
            {(phase === "result" || phase === "score") && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
                <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Actual</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {scoreCell("3")}
                  <span style={{ color: "var(--text-dim)", fontSize: 14 }}>–</span>
                  {scoreCell("1")}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {phase === "locked" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ fontSize: 10, color: "#f59e0b", letterSpacing: 1, marginBottom: 12 }}
            >
              Picks locked at kickoff
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase === "score" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: "hidden" }}
            >
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 4 }}>
                <div style={{ fontSize: 11, color: "var(--text-mid)", letterSpacing: 0.5, marginBottom: 6 }}>
                  |2−3| + |1−1| = 1 + 0
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20, fontWeight: 500, color: "var(--text-bright)" }}>1 point</span>
                  <span style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: 1 }}>LOWER IS BETTER</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Landing page ─────────────────────────────────────────────────────────────

const STEPS = [
  {
    num: "01",
    title: "Join or create a group",
    body: "Share an invite code. Everyone in your group sees the same fixtures each gameweek.",
  },
  {
    num: "02",
    title: "Submit your scorelines",
    body: "Pick exact home and away goals for every fixture before kickoff. Picks stay hidden until you lock them all in.",
  },
  {
    num: "03",
    title: "Lowest total wins",
    body: "Points are goals off per fixture. Zero is a perfect pick. The leaderboard runs all season.",
  },
];

export default function LandingPage() {
  return (
    <div style={{ fontFamily: "'DM Mono', monospace", color: "var(--text)" }}>

      {/* ── HERO ─────────────────────────────────────── */}
      <section
        className="hero-grid"
        style={{
          paddingTop: 80,
          paddingBottom: 80,
          display: "grid",
          gridTemplateColumns: "55fr 45fr",
          gap: 64,
          alignItems: "center",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 900,
            fontSize: "clamp(2.8rem, 5vw, 4.2rem)",
            color: "var(--text-bright)",
            letterSpacing: -2,
            lineHeight: 1.05,
            marginBottom: 20,
          }}>
            Predict every goal.
          </h1>

          <p style={{
            fontSize: 12,
            color: "var(--text-mid)",
            lineHeight: 1.85,
            maxWidth: 360,
            marginBottom: 36,
            letterSpacing: 0.3,
          }}>
            Score prediction game for friend groups. Pick exact scorelines for
            every Premier League fixture each gameweek. Every goal off costs a
            point. Lowest total wins.
          </p>

          <Link href="/signup" style={{
            background: "var(--btn-bg)",
            color: "var(--btn-text)",
            fontSize: 11,
            letterSpacing: 2,
            textTransform: "uppercase",
            padding: "12px 28px",
            borderRadius: 8,
            fontWeight: 500,
            textDecoration: "none",
            fontFamily: "'DM Mono', monospace",
            display: "inline-block",
          }}>
            Create a group
          </Link>
        </motion.div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <PredictionDemo />
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────── */}
      <section style={{ borderTop: "1px solid var(--border)", paddingTop: "clamp(3rem, 8vw, 5rem)", paddingBottom: "clamp(3rem, 8vw, 5rem)" }}>
        <FadeIn>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 900,
            fontSize: 26,
            color: "var(--text-bright)",
            letterSpacing: -1,
            marginBottom: 36,
          }}>
            How it works.
          </h2>
        </FadeIn>

        <div>
          {STEPS.map((step, i) => (
            <FadeIn key={step.num} delay={i * 0.06}>
              <div
                className="step-row"
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: 22,
                  paddingBottom: 22,
                  display: "grid",
                  gridTemplateColumns: "48px 1fr 1fr",
                  gap: 24,
                  alignItems: "start",
                }}
              >
                <div style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: 2, paddingTop: 2 }}>{step.num}</div>
                <div style={{ fontSize: 13, color: "var(--text-bright)", fontWeight: 500, letterSpacing: 0.2, lineHeight: 1.4 }}>{step.title}</div>
                <div style={{ fontSize: 11, color: "var(--text-mid)", lineHeight: 1.8 }}>{step.body}</div>
              </div>
            </FadeIn>
          ))}
          <div style={{ borderTop: "1px solid var(--border)" }} />
        </div>
      </section>

      {/* ── SCORING ──────────────────────────────────── */}
      <section style={{ borderTop: "1px solid var(--border)", paddingTop: "clamp(3rem, 8vw, 5rem)", paddingBottom: "clamp(3rem, 8vw, 5rem)" }}>
        <FadeIn>
          <div
            className="scoring-strip"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1px 1fr",
              gap: 40,
              alignItems: "center",
            }}
          >
            <div>
              <h2 style={{
                fontFamily: "'Playfair Display', serif",
                fontWeight: 900,
                fontSize: 26,
                color: "var(--text-bright)",
                letterSpacing: -1,
                marginBottom: 14,
              }}>
                Points are goals off.
              </h2>
              <p style={{ fontSize: 11, color: "var(--text-mid)", lineHeight: 1.85, maxWidth: 340 }}>
                For each fixture, count how many goals off you were on each side.
                Zero is a perfect pick. Accumulate the least over the season.
              </p>
            </div>

            <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch" }} />

            <div style={{ fontFamily: "'DM Mono', monospace" }}>
              <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: 3, textTransform: "uppercase", marginBottom: 14 }}>Formula</div>
              <div style={{ fontSize: 15, color: "var(--text-bright)", fontWeight: 500, letterSpacing: 0.5, marginBottom: 16 }}>
                pts = |pH − aH| + |pA − aA|
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim2)", lineHeight: 2, marginBottom: 16 }}>
                <div>pH / aH = predicted / actual home goals</div>
                <div>pA / aA = predicted / actual away goals</div>
              </div>
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, fontSize: 11, color: "var(--text-mid)" }}>
                predict 2-1, actual 3-1: |2−3| + |1−1| ={" "}
                <span style={{ color: "var(--text-bright)", fontWeight: 500 }}>1 pt</span>
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ── CTA ──────────────────────────────────────── */}
      <FadeIn>
        <section
          className="cta-grid"
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: "clamp(3rem, 8vw, 5rem)",
            paddingBottom: "clamp(4rem, 10vw, 6rem)",
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "end",
            gap: 40,
          }}
        >
          <div>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 900,
              fontSize: "clamp(2rem, 4vw, 3rem)",
              color: "var(--text-bright)",
              letterSpacing: -2,
              lineHeight: 1.1,
              marginBottom: 12,
            }}>
              Start a group.
            </h2>
            <p style={{ fontSize: 11, color: "var(--text-mid)", letterSpacing: 0.3 }}>
              Free. Invite friends with a code. Picks open each gameweek.
            </p>
          </div>

          <Link href="/signup" style={{
            background: "var(--btn-bg)",
            color: "var(--btn-text)",
            fontSize: 11,
            letterSpacing: 2,
            textTransform: "uppercase",
            padding: "13px 32px",
            borderRadius: 8,
            fontWeight: 500,
            textDecoration: "none",
            fontFamily: "'DM Mono', monospace",
            display: "inline-block",
            whiteSpace: "nowrap",
          }}>
            Create a group
          </Link>
        </section>
      </FadeIn>

      <style>{`
        @media (max-width: 720px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .scoring-strip { grid-template-columns: 1fr !important; }
          .scoring-strip > div:nth-child(2) { display: none; }
          .cta-grid { grid-template-columns: 1fr !important; }
          .step-row { grid-template-columns: 48px 1fr !important; }
          .step-row > div:last-child { grid-column: 2; }
        }
      `}</style>
    </div>
  );
}
