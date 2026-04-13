import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import legacy from "@vitejs/plugin-legacy";
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
    proxy: {
      '/api/whisper-asr': {
        target: 'https://whisper-project-resonance.project-resonance.cn',
        changeOrigin: true,
        rewrite: (path) => '/v1/audio/transcriptions',
      },
      '/api/cosyvoice-tts': {
        target: 'https://cosyvoice-project-resonance.project-resonance.cn',
        changeOrigin: true,
        rewrite: (path) => '/gradio_api/call/generate_audio',
      },
    },
  },
  plugins: [
    react(),
    legacy({
      targets: ["defaults", "not IE 11", "Chrome >= 49", "Safari >= 10", "iOS >= 10", "Android >= 6"],
      additionalLegacyPolyfills: ["regenerator-runtime/runtime"],
    }),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: ["es2015", "chrome49", "safari10", "ios10"],
  },
}));
