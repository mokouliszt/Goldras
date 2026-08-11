/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // アプリ本体と同じトークン。鉱石から精錬までを一続きの色域として持つ
        pit: "#0b0c0e",
        seam: "#14161a",
        vein: "#1c1f25",
        line: "rgba(237,232,222,.10)",
        ink: { DEFAULT: "#ede8de", 60: "rgba(237,232,222,.62)", 40: "rgba(237,232,222,.40)" },
        ore: "#8b8171",
        bullion: { DEFAULT: "#e8b04b", soft: "rgba(232,176,75,.12)" },
        flux: "#f4d79a",
        assay: "#4fbf9f",
        slag: "#de5b4e",
        copper: "#c77b4b",
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
        disp: ['"Archivo Narrow"', '"Noto Sans JP"', "sans-serif"],
      },
      maxWidth: { content: "1120px" },
    },
  },
  plugins: [],
};
