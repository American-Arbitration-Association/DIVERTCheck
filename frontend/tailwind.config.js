// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      typography: () => {
        return {
          DEFAULT: {
            css: {
              maxWidth: "100ch",

              // Override nested list styles in Tailwind Typography (prose)
              "ul > li > ul": {
                marginTop: "0.5em",
                marginBottom: "0.5em",
                listStyleType: "circle",
              },
              "ol > li > ul": {
                marginTop: "0.5em",
                marginBottom: "0.5em",
                listStyleType: "circle",
              },
              "ul > li > ol": {
                marginTop: "0.5em",
                marginBottom: "0.5em",
                listStyleType: "lower-alpha",
              },
              "ol > li > ol": {
                marginTop: "0.5em",
                marginBottom: "0.5em",
                listStyleType: "lower-alpha",
              },
              // Second level nesting
              "ul > li > ul > li > ul": {
                listStyleType: "square",
              },
              "ol > li > ul > li > ul": {
                listStyleType: "square",
              },
              "ul > li > ol > li > ul": {
                listStyleType: "square",
              },
              "ol > li > ol > li > ul": {
                listStyleType: "square",
              },
              "li > p": {
                marginTop: "0",
                marginBottom: "0",
              },
              "li > p + p": {
                marginTop: "0.5em",
              },
            },
          },
        };
      },
      colors: {
        black: {
          DEFAULT: "#0D0B26",
        },
        page: {
          DEFAULT: "#F7F6F5",
        },
        alpha: {
          10: "#FFFFFF · 90%",
        },
        secondary: {
          DEFAULT: "#F0EFEE",
        },
        placeholder: "#78716C",
        foreground: {
          primary: "#272423",
          secondary: "#4A4442",
          tertiary: "#6C717E",
          muted: "#574E4D",
          inverse: "#F7F6F5",
          table: {
            hover: "#FCFAFA",
          },
        },
        accent: {
          DEFAULT: "#ffffff",
        },
        border: "#DEDAD9",
        brand: {
          red: {
            DEFAULT: "#cf2a1b",
            subtle: "#FAEAE8",
          },
          blue: {
            DEFAULT: "#4238D6",
            subtle: "#EDF1FF",
          },
          olive: {
            DEFAULT: "#42574B",
            subtle: "#E0E7E3",
          },
          brown: {
            DEFAULT: "#706B53",
          },
          purple: {
            DEFAULT: "#434257",
            subtle: "#E9EAF0",
          },
          green: {
            DEFAULT: "#39D67E",
          },
          orange: {
            DEFAULT: "#ea910cff",
            subtle: "#fed7aa",
          },
        },
        status: {
          destructive: {
            strong: "#dc2626",
            subtle: "#fef2f2",
          },
          success: {
            subtle: "#F0FDF5",
            strong: "#1A9F55",
          },
        },
        muted: {
          DEFAULT: "#DEDAD9",
        },
      },
      fontWeight: {
        thin: "100",
        extralight: "200",
        light: "300",
        normal: "400",
        medium: "500",
        semibold: "600",
        bold: "700",
        extrabold: "800",
        black: "900",
      },
      fontSize: {
        xxs: "0.7rem",
        xs: "0.75rem",
        sm: "0.875rem",
        base: "1rem",
        lg: "1.125rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
        "4xl": "2.5rem",
        "7xl": "3.5rem",
      },
      lineHeight: {
        1: "1rem",
        2: "1.125rem",
        3: "1.25rem",
        4: "1.5rem",
        5: "1.75rem",
        6: "2.4rem",
        11: "4rem",
        "3xl": "2rem",
        "7xl": "3.5rem",
      },
      letterSpacing: {
        normal: "0",
        "tight-s": "-0.02rem",
        "tight-xl": "-0.035rem",
      },
      borderRadius: {
        none: "0",
        default: "0.25rem",
        sm: "0.125rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
        full: "9999px",
      },
      borderColor: {
        input: "#c1bab8",
        strong: "#272423",
        muted: "#DEDAD9",
        subtle: "#C1BAB8",
        base: "#9E9492",
      },
      spacing: {
        1: "0.25rem",
        2: "0.5rem",
        3: "0.75rem",
        4: "1rem",
        5: "1.25rem",
        6: "1.5rem",
        10: "2.5rem",
      },
      keyframes: {
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
    fontFamily: {
      inter: ["Inter", "sans-serif"],
      sans: ["Inter", "sans-serif"],
      suisse: ["Suisse Intl", "sans-serif"],
      serif: ["Gestura Text", "serif"],
      gestura: ["Gestura Text", "serif"],
    },
  },
  // plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};
