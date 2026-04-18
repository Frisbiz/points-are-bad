"use client";

import { motion, AnimatePresence, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import Link from "next/link";

// ─── Index theme tokens ────────────────────────────────────────────────────────
const T = {
  bg:        "#f6f6f7",
  surface:   "#ffffff",
  border:    "rgba(0,0,0,0.06)",
  border2:   "rgba(0,0,0,0.08)",
  text:      "#121417",
  textDim:   "#7b818a",
  textMid:   "#565d66",
  textBright:"#111315",
  btnBg:     "#15181c",
  btnText:   "#ffffff",
};

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
    result: { color: T.textDim, bg: "transparent", border: T.border2 },
    score:  { color: T.textDim, bg: "transparent", border: T.border2 },
  }[phase];

  const scoreCell = (val: string, dim?: boolean) => (
    <div style={{
      width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
      background: T.bg, border: `1px solid ${T.border2}`, borderRadius: 8,
      fontSize: 22, fontWeight: 500, fontFamily: "'DM Mono', monospace",
      color: T.textBright, opacity: dim ? 0.4 : 1, transition: "opacity 0.2s",
    }}>{val}</div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18, duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      style={{ width: "100%", maxWidth: 400 }}
    >
      <div style={{
        background: "linear-gradient(180deg, #ffffff, #fbfbfc)",
        border: `1px solid ${T.border2}`,
        boxShadow: "0 0 0 1px rgba(0,0,0,.015), inset 0 1px 0 rgba(255,255,255,.78)",
        borderRadius: 24,
        minHeight: 330,
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "20px 20px 0", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: "#9cb6cf", letterSpacing: 3, textTransform: "uppercase", marginBottom: 5 }}>Matchweek 32</div>
            <div style={{ fontSize: 14, color: T.textBright, fontWeight: 500 }}>Arsenal vs Tottenham</div>
            <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>Sat 15 Apr · 12:30</div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={statusLabel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                fontSize: 9, letterSpacing: 2, fontWeight: 500, padding: "6px 10px",
                borderRadius: 999, border: `1px solid ${statusColor.border}`,
                background: statusColor.bg, color: statusColor.color,
                backdropFilter: "blur(12px)",
              }}
            >
              {statusLabel}
            </motion.div>
          </AnimatePresence>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "0 20px", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Your pick</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {scoreCell("2", phase !== "open")}
              <span style={{ color: T.textDim, fontSize: 14 }}>–</span>
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
                <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Actual</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {scoreCell("3")}
                  <span style={{ color: T.textDim, fontSize: 14 }}>–</span>
                  {scoreCell("1")}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div style={{ minHeight: 62, padding: "0 20px 20px" }}>
          <AnimatePresence>
            {phase === "open" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ fontSize: 10, color: T.textDim, letterSpacing: 1, marginBottom: 12 }}
              >
                Picks open until kickoff
              </motion.div>
            )}
          </AnimatePresence>
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, marginTop: 4 }}>
                  <div style={{ fontSize: 11, color: T.textMid, letterSpacing: 0.5, marginBottom: 6, fontFamily: "'DM Mono', monospace" }}>
                    |2−3| + |1−1| = 1 + 0
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20, fontWeight: 500, color: T.textBright, fontFamily: "'DM Mono', monospace" }}>1 point</span>
                    <span style={{ fontSize: 10, color: T.textDim, letterSpacing: 1 }}>LOWER IS BETTER</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Marquee ──────────────────────────────────────────────────────────────────
function Marquee() {
  return (
    <div style={{ overflow: "hidden", position: "relative", padding: "18px 0 10px", marginLeft: "calc(50% - 50vw)", marginRight: "calc(50% - 50vw)" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 120, background: `linear-gradient(90deg, ${T.bg} 0%, transparent 100%)`, zIndex: 2, pointerEvents: "none" }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 120, background: `linear-gradient(270deg, ${T.bg} 0%, transparent 100%)`, zIndex: 2, pointerEvents: "none" }} />
      <div style={{ display: "flex", width: "max-content", animation: "marqueeScroll 32s linear infinite", whiteSpace: "nowrap" }}>
        {Array.from({ length: 36 }).map((_, i) => (
          <div key={i} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", marginRight: 34 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: T.textBright, letterSpacing: "-0.03em", lineHeight: 1 }}>
              Points Are Bad
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────
const STEPS = [
  { num: "01", title: "Join a group",         body: "Create a private league or join an invite-only group with a code." },
  { num: "02", title: "Make your picks",       body: "Predict every scoreline before kickoff. Hidden picks keep everyone honest." },
  { num: "03", title: "Watch the damage",      body: "Every goal off counts against you. Being close isn't close enough." },
  { num: "04", title: "Finish lowest",         body: "Lowest total after the season wins." },
];

// ─── Landing page ─────────────────────────────────────────────────────────────
export default function LandingPage() {
  const howRef = useRef<HTMLElement>(null);
  const howInView = useInView(howRef, { once: true, margin: "-60px 0px" });
  const stepsRef = useRef<HTMLDivElement>(null);
  const stepsInView = useInView(stepsRef, { once: true, margin: "-80px 0px" });
  const ctaRef = useRef<HTMLElement>(null);
  const ctaInView = useInView(ctaRef, { once: true, margin: "-80px 0px" });

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", color: T.text, background: T.bg, minHeight: "100vh" }}>

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <div className="index-grid-bg" style={{ maxWidth: 1280, margin: "0 auto", padding: "96px 24px 0" }}>
        <section
          className="land-hero"
          style={{ padding: "36px 0 72px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}
        >
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          >
            <div style={{ fontSize: 11, color: T.textDim, letterSpacing: 1.6, marginBottom: 8 }}>pab.wtf</div>
            <div style={{ fontSize: 11, color: T.textDim, letterSpacing: "0.15em", marginBottom: 28 }}>Premier League score predictions</div>
            <h1 style={{ fontWeight: 800, fontSize: "clamp(2.2rem, 5vw, 3.75rem)", color: T.textBright, letterSpacing: "-0.025em", lineHeight: 1.08, marginBottom: 10, maxWidth: 560 }}>
              Join one group.
            </h1>
            <div style={{ fontWeight: 800, fontSize: "clamp(2.2rem, 5vw, 3.75rem)", lineHeight: 1.08, letterSpacing: "-0.025em", marginBottom: 20, color: T.textBright }}>
              Make <span style={{ WebkitTextStroke: "1px rgba(0,0,0,.22)", color: "transparent" }}>real picks</span>.
            </div>
            <p style={{ fontSize: 15, color: T.textMid, lineHeight: 1.7, maxWidth: 420, marginBottom: 36 }}>
              Predict exact scores for every Premier League game. Every goal off costs a point. Lowest total wins.
            </p>
            <div className="land-hero-btns" style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
              <Link href="/signup" className="land-btn" style={{ background: T.btnBg, color: T.btnText, fontSize: 13, letterSpacing: 0.1, padding: "12px 20px", borderRadius: 0, fontWeight: 600, textDecoration: "none", display: "inline-block" }}>
                Sign in / up
              </Link>
              <Link href="/login" className="land-btn" style={{ background: "transparent", color: T.textBright, fontSize: 13, letterSpacing: 0.1, fontWeight: 600, textDecoration: "none" }}>
                Try Demo →
              </Link>
            </div>
            <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 10, fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(86,93,102,.55)" }}>
              <span>Hidden picks</span>
              <span style={{ width: 1, height: 10, background: "rgba(0,0,0,.12)" }} />
              <span>Premier League</span>
              <span style={{ width: 1, height: 10, background: "rgba(0,0,0,.12)" }} />
              <span>Lowest wins</span>
            </div>
          </motion.div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <PredictionDemo />
          </div>
        </section>

        <Marquee />

        {/* ── HOW IT WORKS ──────────────────────────────────────── */}
        <section ref={howRef} className="land-section" style={{ padding: "64px 0", borderTop: `1px solid ${T.border}` }}>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={howInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            style={{ fontSize: 12, color: T.textDim, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8, fontWeight: 500 }}
          >How it works</motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 6 }}
            animate={howInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1], delay: 0.07 }}
            style={{ fontWeight: 600, fontSize: 32, color: T.textBright, letterSpacing: "-0.02em", marginBottom: 40, maxWidth: 420 }}
          >Simple by design.</motion.h2>
          <div ref={stepsRef} className="land-steps" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {STEPS.map((s, idx) => (
              <motion.div
                key={s.num}
                className="liquid-card"
                initial={{ opacity: 0, y: 8 }}
                animate={stepsInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1], delay: 0.1 + idx * 0.07 }}
                style={{ borderRadius: 24, padding: "32px 28px", position: "relative", overflow: "hidden" }}
              >
                <span style={{ position: "absolute", right: -6, top: -18, fontSize: 110, fontWeight: 800, letterSpacing: "-0.06em", color: "rgba(0,0,0,.03)", lineHeight: 1 }}>{s.num}</span>
                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ fontSize: 11, color: T.textDim, letterSpacing: 1.2, marginBottom: 14, fontWeight: 600 }}>{s.num}</div>
                  <div style={{ fontSize: 16, color: T.textBright, fontWeight: 600, marginBottom: 10 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: T.textMid, lineHeight: 1.65, maxWidth: 220 }}>{s.body}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────────── */}
        <section ref={ctaRef} className="land-cta-section" style={{ padding: "80px 0 100px", textAlign: "center", borderTop: `1px solid ${T.border}` }}>
          <motion.div
            className="liquid-card"
            initial={{ opacity: 0, y: 8 }}
            animate={ctaInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            style={{ maxWidth: 760, margin: "0 auto", borderRadius: 32, padding: "56px 24px", textAlign: "center" }}
          >
            <div style={{ fontSize: 12, color: T.textDim, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 16, fontWeight: 500 }}>Play</div>
            <h2 style={{ fontWeight: 600, fontSize: "clamp(2rem, 4vw, 2.6rem)", color: T.textBright, letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 16 }}>
              Start losing with friends today.
            </h2>
            <p style={{ fontSize: 15, color: T.textMid, marginBottom: 36, maxWidth: 460, margin: "0 auto 36px", lineHeight: 1.7 }}>
              Free to use. Invite friends with a code. Picks open each gameweek.
            </p>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14 }}>
              <Link href="/signup" className="land-btn" style={{ background: T.btnBg, color: T.btnText, fontSize: 13, padding: "12px 24px", borderRadius: 0, fontWeight: 600, textDecoration: "none", display: "inline-block" }}>
                Sign in / up
              </Link>
              <Link href="/login" className="land-btn" style={{ background: "transparent", color: T.textBright, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                Try demo →
              </Link>
            </div>
          </motion.div>
        </section>
      </div>

      <style>{`
        @keyframes marqueeScroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .index-grid-bg { position: relative; }
        .index-grid-bg::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(0,0,0,.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,0,0,.04) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,.14));
          pointer-events: none;
        }
        .liquid-card {
          position: relative;
          overflow: hidden;
          background: linear-gradient(180deg, #f7f7f8, #efeff2);
          border: 1px solid rgba(0,0,0,.06);
          box-shadow: 0 0 0 1px rgba(0,0,0,.015), inset 0 1px 0 rgba(255,255,255,.5);
        }
        .liquid-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(90% 80% at 50% 50%, rgba(0,0,0,.03) 0%, transparent 68%);
          animation: liquidFlow 24s ease-in-out infinite;
          pointer-events: none;
        }
        .liquid-card::after {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(70% 90% at 50% 50%, rgba(0,0,0,.02) 0%, transparent 62%);
          animation: liquidFlowB 30s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes liquidFlow {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(4%,-3%) scale(1.04); }
          66%      { transform: translate(-3%,4%) scale(.97); }
        }
        @keyframes liquidFlowB {
          0%,100% { transform: translate(0,0) scale(1); }
          40%      { transform: translate(-5%,3%) scale(1.06); }
          70%      { transform: translate(3%,-5%) scale(.96); }
        }
        @media (max-width: 720px) {
          .land-hero  { grid-template-columns: 1fr !important; gap: 28px !important; padding-top: 20px !important; }
          .land-steps { grid-template-columns: 1fr !important; gap: 14px !important; }
        }
        @media (max-width: 620px) {
          .land-hero        { padding-top: 0 !important; padding-bottom: 32px !important; }
          .land-hero-btns   { flex-direction: column !important; align-items: stretch !important; }
          .land-cta-section { padding: 0 !important; }
          .land-cta-section .liquid-card { padding: 36px 20px !important; border-radius: 20px !important; }
        }
        .land-btn { transition: opacity 0.15s ease, transform 0.1s cubic-bezier(0.23, 1, 0.32, 1); }
        .land-btn:hover { opacity: 0.82; }
        .land-btn:active { transform: translateY(-1px); }
        @media (hover: hover) and (pointer: fine) {
          .land-btn:hover { opacity: 0.82; }
        }
      `}</style>
    </div>
  );
}
