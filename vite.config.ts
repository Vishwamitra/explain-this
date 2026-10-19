import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [crx({ manifest })],
  // This project has no PostCSS pipeline. An inline config stops Vite from
  // walking up the directory tree and picking up an unrelated parent config.
  css: { postcss: { plugins: [] } },
  build: {
    rollupOptions: {
      input: {
        offscreen: "src/offscreen/offscreen.html"
      }
    }
  }
});
