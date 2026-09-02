import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * 配信先のサブパス（設計書 8.6）。
 *
 * GitHub Pages では `/<リポジトリ名>/` になる。独自ドメインへ移す判断をしても
 * コードを変えずに済むよう、環境変数で与える。
 */
const base = process.env["BASE_PATH"] ?? "/";

/** PWA の manifest。`start_url` と `scope` を base に合わせる必要があるため生成する */
function manifest(): string {
  return JSON.stringify(
    {
      name: "Mieru",
      short_name: "Mieru",
      description: "考えを整理し、そのまま AI に渡せるマインドマップツール",
      lang: "ja",
      dir: "ltr",
      start_url: base,
      scope: base,
      display: "standalone",
      background_color: "#0A0F1F",
      // アイコンの地と同じ色（設計書 12.6）。起動時のちらつきを抑える
      theme_color: "#0A0F1F",
      icons: [
        // any と maskable はファイルを分ける（"any maskable" とまとめない）
        { src: `${base}icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
        {
          src: `${base}icons/icon-maskable-512.png`,
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    null,
    2,
  );
}

/** manifest をビルド出力へ書き出し、開発サーバでも同じ内容を返す */
function webManifest(): Plugin {
  const fileName = "manifest.webmanifest";
  return {
    name: "mieru-webmanifest",
    configureServer(server) {
      server.middlewares.use(`${base}${fileName}`, (_request, response) => {
        response.setHeader("Content-Type", "application/manifest+json");
        response.end(manifest());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName, source: manifest() });
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), webManifest()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // カバレッジの対象は変換エンジン・永続化・編集ロジックに限定する。
      // React の描画層は自動テストを整備せず手動試験に委ねる方針（docs/project-plan.md 7.1）。
      // その代わり、編集の正しさは src/state/ の純粋関数として検証できるようにしている。
      include: ["src/core/**/*.ts", "src/store/**/*.ts", "src/state/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
