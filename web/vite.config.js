import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" => funguje na GitHub Pages v podsložce i lokálně ze souboru/serveru
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
});
