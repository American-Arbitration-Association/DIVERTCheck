//Copyright © 2026 American Arbitration Association, Inc. All rights reserved
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { defineConfig } from "vite";

const buildModeIndex = process.argv.indexOf("--mode");
const buildMode =
  buildModeIndex >= 0
    ? (process.argv[buildModeIndex + 1] ?? "production")
    : "production";
const envFilePath = path.resolve(__dirname, `./.env.${buildMode}`);
const envFileContents = fs.existsSync(envFilePath)
  ? fs.readFileSync(envFilePath, "utf8")
  : "";
const envMatch = /^\s*VITE_API_BASE_URL\s*=\s*(.+)\s*$/m.exec(envFileContents);
const apiBaseUrl = envMatch?.[1]?.trim() ?? "";
const loginEndpoint = apiBaseUrl ? `${apiBaseUrl}/Auth/login` : "";

console.log(
  `[vite build] mode=${buildMode} envFile=.env.${buildMode} VITE_API_BASE_URL=${apiBaseUrl || "(unset)"} loginEndpoint=${loginEndpoint || "(unset)"}`,
);

export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `
        @use "@/styles/variables" as *;`,
      },
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  preview: {
    port: 5000,
    allowedHosts: [""],
  },
});
