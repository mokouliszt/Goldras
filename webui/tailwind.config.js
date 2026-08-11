/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // <alpha-value> を挟むことで bg-ore/55 等の不透明度指定が効く
        pit: "rgb(var(--pit-rgb) / <alpha-value>)",
        seam: "rgb(var(--seam-rgb) / <alpha-value>)",
        vein: "rgb(var(--vein-rgb) / <alpha-value>)",
        line: "rgb(var(--line-rgb) / <alpha-value>)",
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        ore: "rgb(var(--ore-rgb) / <alpha-value>)",
        bullion: "rgb(var(--bullion-rgb) / <alpha-value>)",
        flux: "rgb(var(--flux-rgb) / <alpha-value>)",
        assay: "rgb(var(--assay-rgb) / <alpha-value>)",
        slag: "rgb(var(--slag-rgb) / <alpha-value>)",
        copper: "rgb(var(--copper-rgb) / <alpha-value>)",
        cinder: "rgb(var(--cinder-rgb) / <alpha-value>)",
      },
      borderRadius: { xl: "14px", "2xl": "18px" },
    },
  },
  plugins: [],
};
