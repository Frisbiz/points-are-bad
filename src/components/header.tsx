"use client";

import { useState } from "react";
import Link from "next/link";

type Thumb = { id: number; x: number; y: number };

export default function Header() {
  const [thumbs, setThumbs] = useState<Thumb[]>([]);

  const spawnThumb = (e: React.MouseEvent) => {
    const id = Date.now() + Math.random();
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2 + (Math.random() - 0.5) * 20;
    const y = r.top;
    setThumbs((t) => [...t, { id, x, y }]);
    setTimeout(() => setThumbs((t) => t.filter((th) => th.id !== id)), 850);
  };

  return (
    <header style={{ padding: "16px 24px 0", height: 76, position: "fixed", top: 0, left: 0, right: 0, zIndex: 20 }}>
      {thumbs.map((th) => (
        <div key={th.id} className="thumbdown" style={{ left: th.x - 13, top: th.y - 10 }}>👎</div>
      ))}
      <div style={{
        maxWidth: 560, margin: "0 auto", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: 44, borderRadius: 18, padding: "0 10px",
        background: "rgba(255,255,255,.72)", border: "1px solid rgba(255,255,255,.6)",
        backdropFilter: "blur(24px) saturate(1.2)",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none", padding: "0 12px", height: 32 }}>
          <span style={{ fontFamily: "Inter, system-ui, sans-serif", fontWeight: 800, fontSize: 16, color: "var(--text-bright)", lineHeight: 1 }}>POINTS</span>
          <span
            onClick={spawnThumb}
            style={{ color: "var(--text-dim)", fontSize: 9, letterSpacing: 3, fontFamily: "'DM Mono', monospace", fontWeight: 400, cursor: "pointer", userSelect: "none", lineHeight: 1 }}
          >
            are bad
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Link href="/login" style={{ fontSize: 13, color: "var(--text-dim)", textDecoration: "none", fontWeight: 500 }}>
            Sign in
          </Link>
          <Link href="/signup" style={{
            background: "var(--btn-bg)", color: "var(--btn-text)",
            fontSize: 13, textDecoration: "none", padding: "0 16px",
            height: 32, borderRadius: 12, fontWeight: 600,
            display: "inline-flex", alignItems: "center",
          }}>
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}
