import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Spotify Client ID is a public identifier (OAuth spec) — safe to expose in the bundle.
  // Read from env so it doesn't have to be hardcoded in source.
  define: {
    "import.meta.env.VITE_SPOTIFY_CLIENT_ID": JSON.stringify(process.env.SPOTIFY_CLIENT_ID ?? ""),
  },
}));
