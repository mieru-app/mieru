import { defineConfig } from "vitest/config";

/**
 * 性能実測（2-13）専用の設定。
 *
 * 通常のテスト（`npm test`）から分けているのは、時間を測る検証が
 * 実行環境の負荷で揺れるためである。稀に落ちるテストを常用の門に入れない。
 */
export default defineConfig({
  test: {
    environment: "node",
    // 数値そのものを見たいので、通過した検証の出力も表示する
    reporters: ["verbose"],
    include: ["scripts/**/*.test.ts"],
    // 計測中に他の処理と資源を取り合わないよう1つずつ走らせる
    fileParallelism: false,
    // 何度も繰り返して中央値を取るため、既定の5秒では足りない
    testTimeout: 120_000,
  },
});
