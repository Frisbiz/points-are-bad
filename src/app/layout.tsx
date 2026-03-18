import type { Metadata } from "next";
import Link from "next/link";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Points Are Bad",
  description: "Predict Premier League scores with your friends. Low points win.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${grotesk.variable} bg-slate-950 text-slate-100 antialiased`}
      >
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(61,214,208,0.12),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(229,68,109,0.14),transparent_30%),radial-gradient(circle_at_30%_70%,rgba(56,189,248,0.12),transparent_25%)]" />
        <div className="relative min-h-screen">
          <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
              <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
                <span className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary text-center text-sm leading-8 text-slate-950 shadow-lg">
                  PB
                </span>
                <span>Points Are Bad</span>
              </Link>
              <nav className="flex items-center gap-3 text-sm">
                <Link
                  href="/groups"
                  className="rounded-full border border-slate-800 px-3 py-1.5 transition hover:border-brand-secondary hover:text-brand-secondary"
                >
                  My Groups
                </Link>
                <Link
                  href="/login"
                  className="rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary px-4 py-1.5 font-semibold text-slate-950 shadow hover:opacity-90"
                >
                  Sign in
                </Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-400">
            Built for friends who know that low points are the goal.
          </footer>
        </div>
      </body>
    </html>
  );
}
