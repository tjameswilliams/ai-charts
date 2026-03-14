import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:3002",
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            req.socket?.setTimeout(0);
            req.socket?.setKeepAlive(true);
            proxyReq.socket?.setTimeout(0);
            proxyReq.on("socket", (socket) => {
              socket.setTimeout(0);
              socket.setKeepAlive(true);
            });
          });
          proxy.on("proxyRes", (proxyRes, _req, res) => {
            res.socket?.setTimeout(0);
            proxyRes.socket?.setTimeout(0);
          });
        },
      },
    },
  },
});
