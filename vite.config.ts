import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Phase 0 の時点ではアプリのエントリポイントを持たない（UI は Phase 1 で追加する）。
// react プラグインは Phase 1 で即座に使えるよう先に設定しておく。
export default defineConfig({
  plugins: [react()],
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
