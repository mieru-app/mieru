import { describe, expect, it } from "vitest";

import { exportMarkdown } from "../src/core/export.js";
import { parseMarkdown } from "../src/core/parse.js";
import { serializeMarkdown } from "../src/core/serialize.js";
import type { MapMeta } from "../src/core/types.js";
import { buildMapIndex, queryIndex } from "../src/state/search.js";
import { addChild, collapsedUidsToPaths, flatten, removeNode } from "../src/state/tree.js";

/**
 * 性能の実測（2-13 / NF-01〜NF-03）。
 *
 * **通常のテスト（`npm test`）には含めない。** 時間を測る検証は
 * 実行環境の負荷で結果が揺れ、稀に落ちるテストになる。
 * `npm run perf` で明示的に走らせ、結果を `docs/perf-report.md` に残す。
 *
 * ここで測れるのは変換と編集ロジックだけである。描画（mind-elixir）と
 * ファイル入出力はブラウザでしか測れないため、`docs/perf-report.md` の
 * 「未測定」に残してある。
 */

/** 1000 ノードのマップ。第1階層10・第2階層10・第3階層9 で 1 + 10 + 100 + 900 = 1011 */
function bigMarkdown(): string {
  const lines = ["---", "title: 性能試験", "---", "", "# 性能試験", ""];
  for (let a = 0; a < 10; a += 1) {
    lines.push(`- 論点${a}`);
    for (let b = 0; b < 10; b += 1) {
      lines.push(`  - 観点${a}-${b}`);
      lines.push(`    ${a}-${b} についての説明。ここに背景と根拠を書く。`);
      for (let c = 0; c < 9; c += 1) {
        lines.push(`    - 具体${a}-${b}-${c}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

/** 中央値。1回の外れ値に引きずられないようにする */
function median(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted[middle] ?? 0;
}

function measure(times: number, run: () => void): number {
  const samples: number[] = [];
  for (let i = 0; i < times; i += 1) {
    const started = performance.now();
    run();
    samples.push(performance.now() - started);
  }
  return median(samples);
}

const SOURCE = bigMarkdown();

function report(name: string, ms: number, budgetMs: number): void {
  // 数値そのものを残す。閾値を通ったかだけでは、じわじわ遅くなる変化に気付けない
  console.log(`${name}: ${ms.toFixed(2)} ms（目安 ${budgetMs} ms）`);
  expect(ms).toBeLessThan(budgetMs);
}

describe("1000ノードでの変換と編集", () => {
  const { doc } = parseMarkdown(SOURCE);

  it("ノード数を確かめる", () => {
    expect(flatten(doc.root).length).toBe(1011);
  });

  it("読み込み（Markdown → モデル）", () => {
    report(
      "parseMarkdown",
      measure(20, () => void parseMarkdown(SOURCE)),
      100,
    );
  });

  it("保存（モデル → Markdown）", () => {
    report(
      "serializeMarkdown",
      measure(20, () => void serializeMarkdown(doc)),
      50,
    );
  });

  it("テキスト出力（見出し）", () => {
    report(
      "exportMarkdown",
      measure(20, () => void exportMarkdown(doc, "heading")),
      50,
    );
  });

  it("編集1回（子の追加）", () => {
    const uid = doc.root.children[0]?.uid ?? "";
    report(
      "addChild",
      measure(50, () => void addChild(doc.root, uid)),
      // 16.6ms を超えると1操作で1フレーム落ちる（NF-01）
      16,
    );
  });

  it("編集1回（部分木の削除）", () => {
    const uid = doc.root.children[0]?.uid ?? "";
    report(
      "removeNode",
      measure(50, () => void removeNode(doc.root, uid)),
      16,
    );
  });

  it("折り畳みの保存形式への変換", () => {
    const collapsed = new Set(flatten(doc.root).map((node) => node.uid));
    report(
      "collapsedUidsToPaths",
      measure(20, () => void collapsedUidsToPaths(doc.root, collapsed)),
      50,
    );
  });
});

describe("20マップの全文検索", () => {
  const meta = (id: string): MapMeta => ({
    id,
    title: id,
    tags: [],
    created: "",
    updated: "2026-09-01T00:00:00Z",
    version: id,
  });
  const indexes = Array.from({ length: 20 }, (_unused, i) =>
    buildMapIndex(meta(`m${i}.md`), SOURCE),
  );

  it("索引の作成（20マップ × 1000ノード）", () => {
    report(
      "buildMapIndex ×20",
      measure(5, () => {
        for (let i = 0; i < 20; i += 1) buildMapIndex(meta(`m${i}.md`), SOURCE);
      }),
      2_000,
    );
  });

  it("1打鍵ぶんの絞り込み", () => {
    report(
      "queryIndex",
      measure(50, () => void queryIndex(indexes, { query: "具体5-5" })),
      // 入力のたびに走る。ここが重いと検索欄の反応が鈍る
      16,
    );
  });
});
