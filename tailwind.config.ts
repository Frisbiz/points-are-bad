import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          primary: "#E5446D",
          secondary: "#3DD6D0",
          surface: "#0F172A",
          muted: "#1E293B",
        },
      },
    },
  },
  plugins: [],
};

export default config;
