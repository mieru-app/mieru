/**
 * 新規マップの下敷き（F-01 / 2-10）。
 *
 * **中身は暫定である。** 計画（`docs/ideas/2026-09-04-wbs-archive.md` の Phase 2）で
 * 「テンプレートの中身は実利用の実感が要る」として未決にしてあり、
 * ここに置いてあるのは仕組みを動かすための最初の版にすぎない。
 * 実際に使って要らない枝が分かったら削ること。
 *
 * 中身は Markdown そのもの。表題（H1 と frontmatter の title）は
 * 作成時に利用者の入力へ差し替わるので、ここでは仮の見出しを置いておけばよい。
 */

import type { Strings } from "./strings/ja.js";

export interface Template {
  id: string;
  /** 言語で変わるので、字ではなく引き方を持つ */
  name: (s: Strings) => string;
  description: (s: Strings) => string;
  /**
   * 下敷きの本文。**中身も言語に従う。**
   * 英語で使う人が SWOT を選んで日本語の枝が出るのは、下敷きとして役に立たない。
   * null は「空のマップ」で、`createMap` に下敷きを渡さない
   */
  markdown: ((s: Strings) => string) | null;
}

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: (s) => s.template.blank,
    description: (s) => s.template.blankHint,
    markdown: null,
  },
  {
    id: "swot",
    name: (s) => s.template.swot,
    description: (s) => s.template.swotHint,
    markdown: (s) => s.template.swotBody,
  },
  {
    id: "minutes",
    name: (s) => s.template.minutes,
    description: (s) => s.template.minutesHint,
    markdown: (s) => s.template.minutesBody,
  },
  {
    id: "weekly",
    name: (s) => s.template.weekly,
    description: (s) => s.template.weeklyHint,
    markdown: (s) => s.template.weeklyBody,
  },
];

/** id から下敷きの Markdown を引く。見つからなければ空のマップとして扱う */
export function templateMarkdown(id: string, s: Strings): string | undefined {
  const found = TEMPLATES.find((template) => template.id === id)?.markdown;
  return found === null || found === undefined ? undefined : found(s);
}
