import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev the API runs separately on :8000; in Docker and on Vercel it shares the origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": process.env.API_URL ?? "http://127.0.0.1:8000" },
  },
});
