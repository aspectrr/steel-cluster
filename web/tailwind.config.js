/** @type {import("tailwindcss").Config} */
import animate from "tailwindcss-animate";
import { radixColors } from "./radix.colors";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      spacing: {
        1.5: "0.375rem",
      },
      fontFamily: {
        sans: ["Geist"],
        mono: ["Geist Mono"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        "background-0": "#0F0F0F",
        ...radixColors,
        background: "var(--sand-1)",
        foreground: "var(--sand-12)",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "var(--sand-12)",
          foreground: "var(--sand-1)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "var(--sand-1)",
          foreground: "var(--sand-11)",
        },
        accent: {
          DEFAULT: "var(--sand-3)",
          foreground: "var(--sand-12)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "var(--sand-3)",
        input: "var(--sand-3)",
        ring: "hsl(var(--ring))",
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
      },
      animation: {
        shimmer: "shimmer 2s linear infinite",
        "spin-slow": "spin 5s linear infinite",
        "text-shimmer": "textShimmer 2.2s linear infinite",
        "svg-shimmer": "svgShimmer 2.2s linear infinite",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "bounce-in": "bounceIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        "slide-in-from-left": "slideInFromLeft 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
      },
      keyframes: {
        textShimmer: {
          "0%": {
            backgroundPosition: "200% center",
          },
          "100%": {
            backgroundPosition: "0% center",
          },
        },
        svgShimmer: {
          "0%": {
            stroke: "var(--yellow-9)",
          },
          "50%": {
            stroke: "var(--yellow-8)",
          },
          "80%": {
            stroke: "var(--yellow-9)",
          },
        },
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        bounceIn: {
          "0%": {
            transform: "scale(0)",
            opacity: "0",
          },
          "50%": {
            transform: "scale(1.2)",
            opacity: "1",
          },
          "100%": {
            transform: "scale(1)",
            opacity: "1",
          },
        },
      },
    },
  },
  plugins: [animate],
};
