import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  },
  root: "src/web",
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  server: {
    host: true,
    proxy: {
      "/api": `http://localhost:${process.env.VITE_BACKEND_PORT ?? 3000}`,
      "/ws": {
        target: `ws://localhost:${process.env.VITE_BACKEND_PORT ?? 3000}`,
        ws: true,
      },
    },
  },
});
