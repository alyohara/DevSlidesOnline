import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteMotionOptimize } from "@humanspeak/svelte-motion/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [svelteMotionOptimize(), svelte(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      $lib: path.resolve(__dirname, "./src/shared"),
    },
  },
  worker: {
    format: "es",
  },
  build: {
    target: "esnext", // Modern browsers only
    minify: "terser",
    sourcemap: false,
    cssCodeSplit: true,
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
  clearScreen: false,
  server: {
    // Dev: vite serves the SPA; `dev:server` runs the API on 1421.
    port: 1420,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:1421",
        changeOrigin: true,
      },
    },
  },
});