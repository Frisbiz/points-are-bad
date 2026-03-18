import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Points Are Bad",
  description: "Predict Premier League scores with your friends. Low points win.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'DM Mono', monospace" }}>
          <header style={{ borderBottom: "1px solid var(--border)", padding: "0 24px", height: 60 }}>
            <div style={{ maxWidth: 940, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
              <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", flexShrink: 0 }}>
                <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: 18, color: "var(--text-bright)" }}>POINTS</span>
                <span style={{ color: "var(--text-dim)", fontSize: 9, letterSpacing: 3, fontFamily: "'DM Mono', monospace", fontWeight: 400 }}>are bad</span>
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
          <main style={{ maxWidth: 940, margin: "0 auto", padding: "0 24px" }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
