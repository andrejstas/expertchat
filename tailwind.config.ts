import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SF Mono", "Menlo", "monospace"],
      },
      colors: {
        // Deep plum / violet — high index = darker surface, low index = lighter (text)
        ink: {
          100: "#faf6ff",
          200: "#ede5fa",
          300: "#cabde1",
          400: "#9d90bf",
          500: "#766997",
          600: "#574a75",
          700: "#3f3559",
          750: "#352c4e",
          800: "#2a2342",
          850: "#231c39",
          900: "#1c1631",
          925: "#181228",
          950: "#140f24",
          975: "#100b1e",
        },
        accent: {
          50:  "#f5f0ff",
          100: "#ede5ff",
          200: "#dccaff",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
        },
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "thinking": {
          "0%, 80%, 100%": { opacity: "0.2" },
          "40%": { opacity: "1" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "shimmer-slow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
      },
      animation: {
        "fade-up": "fade-up 260ms cubic-bezier(0.16, 1, 0.3, 1)",
        "thinking": "thinking 1.2s ease-in-out infinite",
        "slide-in-right": "slide-in-right 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        "shimmer-slow": "shimmer-slow 3s ease-in-out infinite",
      },
      boxShadow: {
        // depth elevations (realistic dark layered shadows)
        "elev-1": "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 1px 2px rgba(0,0,0,0.45)",
        "elev-2": "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.25)",
        "elev-3": "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 2px 4px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.3)",
        "elev-4": "0 1px 0 0 rgba(255,255,255,0.06) inset, 0 4px 8px rgba(0,0,0,0.45), 0 16px 48px rgba(0,0,0,0.35)",
        // accent-tinted lifted shadow
        "accent-glow": "0 1px 0 0 rgba(255,255,255,0.1) inset, 0 4px 14px -2px rgba(139,92,246,0.5), 0 0 0 1px rgba(167,139,250,0.2)",
      },
    },
  },
  plugins: [],
};
export default config;
