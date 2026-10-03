import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/pdfjs-dist/cmaps/*",
          dest: "pdfjs/cmaps",
          rename: { stripBase: true },
        },
        {
          src: "node_modules/pdfjs-dist/iccs/*",
          dest: "pdfjs/iccs",
          rename: { stripBase: true },
        },
        {
          src: "node_modules/pdfjs-dist/standard_fonts/*",
          dest: "pdfjs/standard_fonts",
          rename: { stripBase: true },
        },
        {
          src: "node_modules/pdfjs-dist/wasm/*",
          dest: "pdfjs/wasm",
          rename: { stripBase: true },
        },
        {
          src: "node_modules/pdfjs-dist/web/images/*",
          dest: "pdfjs/images",
          rename: { stripBase: true },
        },
      ],
    }),
  ],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
