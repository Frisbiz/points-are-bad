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
    <header style={{ borderBottom: "1px solid var(--border)", padding: "0 24px", height: 60 }}>
      {thumbs.map((th) => (
        <div key={th.id} className="thumbdown" style={{ left: th.x - 13, top: th.y - 10 }}>👎</div>
      ))}
      <div style={{ maxWidth: 940, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", flexShrink: 0 }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: 18, color: "var(--text-bright)" }}>POINTS</span>
          <span
            onClick={spawnThumb}
            style={{ color: "var(--text-dim)", fontSize: 9, letterSpacing: 3, fontFamily: "'DM Mono', monospace", fontWeight: 400, cursor: "pointer", userSelect: "none" }}
          >
            are bad
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Link href="/login" style={{ fontSize: 11, color: "var(--text-dim2)", letterSpacing: 2, textTransform: "uppercase", textDecoration: "none" }}>
            Sign In
          </Link>
          <Link href="/signup" style={{ background: "var(--btn-bg)", color: "var(--btn-text)", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", textDecoration: "none", padding: "8px 18px", borderRadius: 8, fontWeight: 500 }}>
            Create Group
          </Link>
        </div>
      </div>
    </header>
  );
}
