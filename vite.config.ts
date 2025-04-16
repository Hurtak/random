import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./", // use relative paths because we are hosting on GitHub Pages which hosts project in a nested directory
  server: {
    port: 3000,
  },
});
