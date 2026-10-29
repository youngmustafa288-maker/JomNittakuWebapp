import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  build: {
    rollupOptions: {
      // finalize-preview.mjs promotes this separate demo entry to index.html.
      input: mode === "studio" ? "preview.html" : "index.html",
    },
  },
}));
