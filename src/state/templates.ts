/**
 * 新規マップの下敷き（F-01 / 2-10）。
 *
 * 下敷きは2種類ある。
 *
 * - **組み込み**（`TEMPLATES`）。中身はコードで固定され、言語表にある
 * - **利用者のテンプレート**（2026-09-09）。**`template` タグの付いたマップ**である
 *
 * 利用者のテンプレートに専用の仕組みは無い。ただのマップなので一覧に並び、
 * 開いて直せば次に作る物に反映される。frontmatter の未知のキーは保存時に落ちるが
 * タグは既に往復するので、印にはタグを使う（`docs/ideas/2026-09-09-user-templates.md`）。
 *
 * **組み込みの中身は暫定である。** 計画（`docs/ideas/2026-09-04-wbs-archive.md` の Phase 2）で
 * 「テンプレートの中身は実利用の実感が要る」として未決にしてあり、
 * ここに置いてあるのは仕組みを動かすための最初の版にすぎない。
 * 利用者のテンプレートができた今、要らない組み込みは削ってよい。
 *
 * 中身は Markdown そのもの。表題（H1 と frontmatter の title）は
 * 作成時に利用者の入力へ差し替わるので、ここでは仮の見出しを置いておけばよい。
 */

import { parseMarkdown } from "../core/parse.js";
import { serializeMarkdown } from "../core/serialize.js";
import type { MapMeta } from "../core/types.js";
import type { Strings } from "./strings/ja.js";

/**
 * テンプレートの印。`mm:` と同じく1語に固定した予約語である。
 * 別名（`テンプレート` など）は、書き出すときにどちらを使うかの判断が要るので置かない
 */
export const TEMPLATE_TAG = "template";

export interface Template {
  id: string;
  /** 言語で変わるので、字ではなく引き方を持つ */
  name: (s: Strings) => string;
  description: (s: Strings) => string;
  /**
   * 組み込みの本文。**中身も言語に従う。**
   * 英語で使う人が SWOT を選んで日本語の枝が出るのは、下敷きとして役に立たない。
   * null は「空のマップ」で、`createMap` に下敷きを渡さない。
   * 利用者のテンプレートは本文を持たない（本文はそのマップそのものである）
   */
  markdown: ((s: Strings) => string) | null;
  /** 利用者のテンプレート。本文はこの id のマップにある */
  fromMap?: string;
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

/** id から組み込みの Markdown を引く。見つからなければ空のマップとして扱う */
export function templateMarkdown(id: string, s: Strings): string | undefined {
  const found = TEMPLATES.find((template) => template.id === id)?.markdown;
  return found === null || found === undefined ? undefined : found(s);
}

/** そのマップはテンプレートか。`list()` が返す情報だけで決まり、本文を読む必要が無い */
export function isTemplate(meta: MapMeta): boolean {
  return meta.tags.includes(TEMPLATE_TAG);
}

/**
 * 利用者のテンプレート。**表題順**に並べる。
 * 更新順にすると、テンプレートを直すたびに新規作成画面での位置が変わる。
 *
 * id はファイル名なので、組み込みの id（`swot` など）とは衝突しない。
 */
export function userTemplates(metas: readonly MapMeta[]): Template[] {
  return metas
    .filter(isTemplate)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((meta) => ({
      id: meta.id,
      name: () => meta.title,
      description: () => "",
      markdown: null,
      fromMap: meta.id,
    }));
}

/**
 * 新規作成画面に並べる順。**空 → 利用者のテンプレート → 組み込み。**
 * 自分で作った物は選ぶつもりで作った物なので、組み込みより前に出す。
 */
export function allTemplates(user: readonly Template[]): Template[] {
  const [blank, ...builtin] = TEMPLATES;
  return blank === undefined ? [...user, ...builtin] : [blank, ...user, ...builtin];
}

/**
 * `createMap` に渡す下敷きの指定。
 * 文字列は組み込みの本文、`fromMap` は利用者のテンプレート（本文はそのマップを読む）
 */
export type TemplateSource = string | { fromMap: string };

/** 選ばれた id を `createMap` の引数に直す。無ければ空のマップ（消された下敷きを選んでいた場合） */
export function templateSource(
  id: string,
  templates: readonly Template[],
  s: Strings,
): TemplateSource | undefined {
  const found = templates.find((template) => template.id === id);
  if (found === undefined) return undefined;
  if (found.fromMap !== undefined) return { fromMap: found.fromMap };
  return found.markdown === null ? undefined : found.markdown(s);
}

/**
 * 下敷きから新しいマップの Markdown を作る。
 *
 * 写すもの: 枝・ノート・配色・折り畳み・`template` 以外のタグ。
 * 変えるもの: 表題と H1（利用者の入力）、`created` と `updated`（今）。
 *
 * **`template` タグは必ず外す。** 外さないと、作った物が全てテンプレートになる。
 * `created` を今にするのは、frontmatter を持たない組み込みから作った場合に
 * 空のまま省かれていた（2026-09-09 に実測）のを直すためでもある。
 */
export function instantiate(md: string, id: string, title: string, at: string): string {
  const { doc } = parseMarkdown(md, { id });
  return serializeMarkdown({
    ...doc,
    meta: {
      ...doc.meta,
      title,
      tags: doc.meta.tags.filter((tag) => tag !== TEMPLATE_TAG),
      created: at,
      updated: at,
    },
    root: { ...doc.root, label: title },
  });
}
