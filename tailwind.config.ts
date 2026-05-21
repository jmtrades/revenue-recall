import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0e14",
        surface: "#121722",
        "surface-2": "#1a2030",
        border: "#232b3d",
        muted: "#8a93a6",
        brand: {
          DEFAULT: "#5b8cff",
          soft: "#2a3a66",
        },
        success: "#34d399",
        warn: "#fbbf24",
        danger: "#f87171",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
