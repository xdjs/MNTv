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
    // Allow ngrok tunnels for mobile testing. ".ngrok-free.app" and
    // ".ngrok.app" cover the free + paid tunnel domains. Each ngrok
    // restart picks a new subdomain, so a wildcard is the only way to
    // avoid editing this file every session.
    allowedHosts: [".ngrok-free.app", ".ngrok.app"],
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-ui": [
            "framer-motion",
            "@radix-ui/react-dialog",
            "@radix-ui/react-slot",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-progress",
            "@radix-ui/react-slider",
            "@radix-ui/react-accordion",
          ],
          "vendor-supabase": ["@supabase/supabase-js"],
        },
      },
    },
  },
}));
