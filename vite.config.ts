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
      // カバレッジの対象は変換エンジンに限定する。
      // UI は自動テストを整備せず手動試験に委ねる方針（docs/project-plan.md 7.1）。
      include: ["src/core/**/*.ts", "src/store/**/*.ts"],
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
