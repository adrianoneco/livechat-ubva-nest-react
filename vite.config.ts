import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { getProxyConfig } from "./vite-plugins/proxy-config";
import { getHMRConfig } from "./vite-plugins/hmr-config";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: false,
    cors: false,
    proxy: getProxyConfig(),
    allowedHosts: true,
    hmr: getHMRConfig(),
    fs: {
      allow: ['..', './storage'],
    },
  },

  publicDir: 'public',

  plugins: [
    react(),
  ].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
    },
  },

  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
}));
