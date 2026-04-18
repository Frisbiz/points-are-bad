import type { Metadata } from "next";
import Header from "@/components/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Points Are Bad",
  description: "Predict Premier League scores with your friends. Low points win.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
          <Header />
          <main>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
