import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// GitHub Pages は https://mokouliszt.github.io/Goldras/ 配下に置かれるので base が要る
export default defineConfig({
  plugins: [react()],
  base: "/Goldras/",
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: { outDir: "dist", emptyOutDir: true, target: "es2020" },
});
