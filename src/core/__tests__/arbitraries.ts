import fc from "fast-check";

import type { MapDoc, MapNode } from "../types.js";

/**
 * プロパティテスト用のジェネレータ。
 *
 * Markdown の構文を壊しやすい文字列を意図的に高い比率で混ぜている。
 * ランダムな文字列だけでは、行頭の `#` や `-`、バックスラッシュといった
 * 実際に往復を壊す入力にほとんど当たらないため。
 */

/** 実際に往復を壊しうる文字列。単純なランダム生成ではまず当たらない */
const TRICKY = [
  "",
  " ",
  "#",
  "# 見出し",
  "###### h6",
  "- bullet",
  "* star",
  "+ plus",
  "> quote",
  "1. one",
  "10) ten",
  "999999999. big",
  "---",
  "***",
  "___",
  "===",
  "```",
  "~~~",
  "```js",
  "\\",
  "\\\\",
  "\\#",
  "\\- item",
  "a\\*b",
  "**bold**",
  "_em_",
  "`code`",
  "[[市場]]",
  "規制動向 → [[市場]]",
  "[ref]",
  "[text](url)",
  "  leading",
  "trailing  ",
  "a\nb",
  "a\n\nb",
  "a\n\n\n\nb",
  "\ttab",
  "🌏",
  "市場 🌏",
  "途中に 🌏 がある",
  "👨‍👩‍👧‍👦",
  "❤️",
  "|表|",
  "<html>",
  "&amp;",
  "a: b",
  "a, b",
  "[a, b]",
  "true",
  "null",
  "1.0",
  "0",
  "-",
  "--",
];

/** 制御文字を含まない現実的な文字列（英数・記号・日本語） */
const plainText = fc.stringMatching(/^[\p{L}\p{N}\p{P}\p{Zs}]{0,24}$/u);

const text = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom(...TRICKY) },
  { weight: 3, arbitrary: plainText },
  { weight: 2, arbitrary: fc.string({ maxLength: 20 }) },
);

/** ノートは複数行になりうる */
const noteText = fc.oneof(
  { weight: 2, arbitrary: text },
  {
    weight: 1,
    arbitrary: fc.array(text, { minLength: 2, maxLength: 4 }).map((lines) => lines.join("\n")),
  },
  {
    weight: 1,
    arbitrary: fc.array(text, { minLength: 2, maxLength: 3 }).map((lines) => lines.join("\n\n")),
  },
);

const emoji = fc.constantFrom("🌏", "💪", "⚠️", "✅", "👨‍👩‍👧‍👦", "🔥");

const nodeArb: fc.Arbitrary<MapNode> = fc.letrec<{ node: MapNode }>((tie) => ({
  node: fc.record({
    uid: fc.constant("generated"),
    path: fc.constant(""),
    label: text,
    emoji: fc.option(emoji, { nil: undefined }),
    note: fc.option(noteText, { nil: undefined }),
    links: fc.constant<string[]>([]),
    children: fc.oneof(
      { maxDepth: 3, depthIdentifier: "tree" },
      fc.constant<MapNode[]>([]),
      fc.array(tie("node"), { maxLength: 3, depthIdentifier: "tree" }),
    ),
  }),
})).node;

/** ISO8601 か空文字列 */
const timestamp = fc.oneof(
  fc.constant(""),
  fc
    .date({ min: new Date("2000-01-01"), max: new Date("2100-01-01"), noInvalidDate: true })
    .map((d) => d.toISOString()),
);

export const docArb: fc.Arbitrary<MapDoc> = fc.record({
  meta: fc.record({
    // id と version は Markdown に出力されないため固定でよい
    id: fc.constant(""),
    version: fc.constant(""),
    title: text,
    tags: fc.array(text, { maxLength: 4 }),
    created: timestamp,
    updated: timestamp,
  }),
  root: nodeArb,
  view: fc.record({
    collapsed: fc.array(fc.stringMatching(/^\d(\.\d){0,3}$/), { maxLength: 4 }),
    colors: fc.oneof(
      fc.constant<"auto">("auto"),
      fc.array(fc.constantFrom("#ff0000", "#00ff00", "blue"), { minLength: 1, maxLength: 3 }),
    ),
  }),
});
