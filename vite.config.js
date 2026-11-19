import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));

export default defineConfig({
  // Sur GitHub Pages le site vit sous /pilotage-budget/ ; dans l'APK, chemins relatifs
  base: process.env.GH_PAGES ? "/pilotage-budget/" : "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: "dist", target: "es2022" }
});
