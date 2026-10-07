/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  // Never inline assets as data: URIs; the strict Content-Security-Policy only allows our own origin.
  build: { assetsInlineLimit: 0 },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    // Process CSS files (needed to read styles.css as text in the stylesheet tests).
    css: { include: [/.+/] },
  },
});
