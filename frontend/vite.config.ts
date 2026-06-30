import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_PROXY_API_TARGET || "http://localhost:8000";

  return {
    plugins: [react()],
    server: {
      allowedHosts: ["run.home.arpa", "run.creeth.net"],
      port: 5173,
      proxy: {
        "/api": apiTarget,
        "/healthz": apiTarget,
        "/readyz": apiTarget
      }
    }
  };
});
