import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    historyApiFallback: true,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      // Proxy /s/<uuid> to Node for actual file downloads
      "^/s/[0-9a-f-]+$": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      // Proxy /s/<uuid>/info and /s/<uuid>/verify-password to Node
      "^/s/[0-9a-f-]+/.+": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
