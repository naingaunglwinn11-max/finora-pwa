import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Finora",
        short_name: "Finora",
        description: "Local-first personal finance for Cash and KBZPay.",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        theme_color: "#053f39",
        background_color: "#f4faf7",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true
      }
    })
  ]
});
