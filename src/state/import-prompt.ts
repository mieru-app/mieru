import type { Strings } from "./strings/ja.js";

/**
 * AI に「Mieru へ取り込める形式で出して」と頼むための指示文（F-36）。
 *
 * 本ツールは Mieru → AI の一方通行として作ってあるが、
 * 逆流（AI に整理させた結果を取り込む）にも同じ Markdown がそのまま使える。
 * そのとき毎回「こういう形式で」と説明する手間を無くすためのものである。
 *
 * **文書ではなくコードに置いてある。** 例文が実際に取り込めることを
 * 自動テストで確かめられるようにするためで、これによりパーサを変えたときに
 * 指示文だけが古くなるという食い違いが構造的に起きない。
 * 変換規則を変えたら `__tests__/import-prompt.test.ts` が落ちる。
 *
 * **指示文も言語に従う**（2.12）。英語で作業している人に日本語の指示を
 * 貼らせると、AI の返事も日本語に寄る。
 *
 * 仕様の正本: docs/design.md 7.3「逆方向」
 */

/**
 * 指示文に添える例文。
 *
 * 指示の各項目を1つずつ実演している（見出し・階層・ノート）。
 * テストはこれを実際にパーサへ通し、警告が出ないことを確かめる。
 */
export function importExample(s: Strings): string {
  return s.importPrompt.example;
}

/** クリップボードへ入れる指示文の全体 */
export function importPrompt(s: Strings): string {
  const rules = s.importPrompt.rules.map((rule) => `- ${rule}`).join("\n");
  return `${s.importPrompt.lead}

${rules}

${s.importPrompt.exampleLabel}

\`\`\`markdown
${importExample(s)}\`\`\`
`;
}
