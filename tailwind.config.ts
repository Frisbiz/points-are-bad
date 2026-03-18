import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Mono", "monospace"],
        display: ["Playfair Display", "serif"],
      },
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        card: "var(--card)",
        border: "var(--border)",
        border2: "var(--border2)",
        text: "var(--text)",
        "text-dim": "var(--text-dim)",
        "text-dim2": "var(--text-dim2)",
        "text-mid": "var(--text-mid)",
        "text-bright": "var(--text-bright)",
      },
    },
  },
  plugins: [],
};

export default config;
