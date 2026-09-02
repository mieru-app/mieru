import { parseMarkdown } from "../core/parse.js";
import type { MapMeta } from "../core/types.js";
import type { MapStore } from "../store/types.js";
import { flatten } from "./tree.js";

/**
 * 全マップ横断の検索（F-05）とタグ絞り込み（F-06）。
 *
 * 索引はクライアント側にだけ置き、`MapStore` には検索用のメソッドを足さない。
 * 4つの実装すべてで意味の通るものだけを `MapStore` に置くという約束
 * （`src/store/types.ts`）を、検索という UI 都合の機能で崩さないためである。
 *
 * 仕様の正本: docs/design.md 7.1 の F-05 / F-06
 */

/**
 * 検索語と索引の突き合わせに使う正規化。
 *
 * NFKC で全角英数と半角カナを畳んでから小文字化する。
 * 日本語入力では全角で打った英字がそのまま残ることが多く、
 * 「ＡＩ」と打って「AI」が見つからないのは利用者から見れば単なる不具合になる。
 */
export function normalizeForSearch(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

/** 索引の1行。マップ内の1か所に対応する */
export interface IndexEntry {
  kind: "title" | "label" | "note";
  /** 画面に出す元のままの文字列 */
  text: string;
  /** 突き合わせ用に正規化した文字列 */
  haystack: string;
}

/** マップ1件分の索引 */
export interface MapIndex {
  id: string;
  title: string;
  tags: string[];
  /** ISO8601。並べ替えに使う */
  updated: string;
  /** 索引を作った時点の内容の版。変わっていなければ作り直さない */
  version: string;
  entries: IndexEntry[];
}

/** 検索結果1件 */
export interface SearchHit {
  id: string;
  title: string;
  updated: string;
  /** 一致した箇所。見出しの下に添えて、なぜ引っ掛かったかを示す */
  excerpt: string;
  kind: IndexEntry["kind"];
}

function entryOf(kind: IndexEntry["kind"], text: string): IndexEntry {
  return { kind, text, haystack: normalizeForSearch(text) };
}

/**
 * Markdown 1件から索引を作る。
 *
 * 本文を行として舐めるのではなく `parseMarkdown` を通すのは、
 * ラベルとノートを区別し、エスケープを解いた状態で索引に載せるためである。
 * 「`\#` で検索しないと見つからない」ような索引は使い物にならない。
 */
export function buildMapIndex(meta: MapMeta, md: string): MapIndex {
  const { doc } = parseMarkdown(md, { id: meta.id, version: meta.version });
  const entries: IndexEntry[] = [entryOf("title", doc.meta.title)];

  for (const node of flatten(doc.root)) {
    if (node.label !== "") entries.push(entryOf("label", node.label));
    if (node.note !== undefined && node.note !== "") entries.push(entryOf("note", node.note));
  }

  return {
    id: meta.id,
    title: doc.meta.title === "" ? meta.id : doc.meta.title,
    tags: doc.meta.tags,
    updated: meta.updated,
    version: meta.version,
    entries,
  };
}

/** 検索語を空白で分ける。全角空白も区切りとして扱う */
export function splitTerms(query: string): string[] {
  return normalizeForSearch(query)
    .split(/\s+/)
    .filter((term) => term !== "");
}

/** 抜粋の最大長。長いノートを丸ごと並べると一覧が読めなくなる */
const EXCERPT_LENGTH = 60;

/** 一致箇所の前後を切り出す。切った側には省略記号を付ける */
function excerpt(text: string, at: number, termLength: number): string {
  if (text.length <= EXCERPT_LENGTH) return text.replace(/\s+/g, " ");
  const margin = Math.max(0, Math.floor((EXCERPT_LENGTH - termLength) / 2));
  const start = Math.max(0, at - margin);
  const end = Math.min(text.length, start + EXCERPT_LENGTH);
  const body = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${body}${end < text.length ? "…" : ""}`;
}

/** 語が最初に当たった場所。見つからなければ null */
function findTerm(
  entries: readonly IndexEntry[],
  term: string,
): { entry: IndexEntry; at: number } | null {
  for (const entry of entries) {
    const at = entry.haystack.indexOf(term);
    if (at !== -1) return { entry, at };
  }
  return null;
}

/**
 * 1件のマップが検索語すべてを含むか調べ、最初に当たった箇所を返す。
 *
 * 語ごとに別の場所へ当たってもよい（AND 条件）。「市場 リスク」で
 * 両方を含むマップを絞り込む、という使い方を想定している。
 * 語が1つも無いときは絞り込みをせず、抜粋の無い結果を返す。
 */
function matchMap(index: MapIndex, terms: readonly string[]): SearchHit | null {
  let best: { entry: IndexEntry; at: number; length: number } | null = null;

  for (const term of terms) {
    const found = findTerm(index.entries, term);
    if (found === null) return null;
    // 抜粋には最初の語が当たった場所を使う。順に読ませたときに自然になる
    best ??= { entry: found.entry, at: found.at, length: term.length };
  }

  return {
    id: index.id,
    title: index.title,
    updated: index.updated,
    excerpt: best === null ? "" : excerpt(best.entry.text, best.at, best.length),
    kind: best?.entry.kind ?? "title",
  };
}

export interface QueryOptions {
  /** 検索語。空なら絞り込みのみ */
  query?: string;
  /** この全てを持つマップだけを残す（AND） */
  tags?: readonly string[];
}

/** 新しい順。更新日時が無いファイルは最後へ回す */
function byUpdatedDesc(a: { updated: string }, b: { updated: string }): number {
  if (a.updated === b.updated) return 0;
  if (a.updated === "") return 1;
  if (b.updated === "") return -1;
  return a.updated < b.updated ? 1 : -1;
}

/**
 * 索引を検索する。検索語が空なら全件を新しい順で返す。
 * 純粋関数として切り出してあるので、画面を動かさずに絞り込みの結果を検証できる。
 */
export function queryIndex(
  indexes: readonly MapIndex[],
  { query = "", tags = [] }: QueryOptions = {},
): SearchHit[] {
  const terms = splitTerms(query);
  const hits: SearchHit[] = [];

  for (const index of indexes) {
    if (!tags.every((tag) => index.tags.includes(tag))) continue;
    const hit = matchMap(index, terms);
    if (hit !== null) hits.push(hit);
  }

  return hits.sort(byUpdatedDesc);
}

/** 索引に現れるタグを出現回数の多い順に集める */
export function collectTags(indexes: readonly MapIndex[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const index of indexes) {
    for (const tag of index.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count === a.count ? a.tag.localeCompare(b.tag) : b.count - a.count));
}

/**
 * 索引の保持と更新。
 *
 * `MapStore.list()` が返す version を鍵にして、内容が変わったマップだけを読み直す。
 * 全件を毎回読み直すと、マップが増えるにつれて検索欄への1打鍵が重くなる。
 */
export class SearchIndex {
  readonly #store: MapStore;
  readonly #indexes = new Map<string, MapIndex>();

  constructor(store: MapStore) {
    this.#store = store;
  }

  /** 現在の索引。検索語との突き合わせは `queryIndex` が行う */
  all(): MapIndex[] {
    return [...this.#indexes.values()];
  }

  /**
   * 一覧に合わせて索引を作り直す。
   * 読めなかったマップは索引から外すだけにし、検索全体を失敗させない。
   */
  async refresh(metas: readonly MapMeta[]): Promise<void> {
    const present = new Set(metas.map((meta) => meta.id));
    for (const id of [...this.#indexes.keys()]) {
      if (!present.has(id)) this.#indexes.delete(id);
    }

    for (const meta of metas) {
      const existing = this.#indexes.get(meta.id);
      if (existing !== undefined && existing.version === meta.version) {
        // 内容は同じでも一覧側の更新日時は変わりうる
        this.#indexes.set(meta.id, { ...existing, updated: meta.updated, title: meta.title });
        continue;
      }
      try {
        const { md } = await this.#store.read(meta.id);
        this.#indexes.set(meta.id, buildMapIndex(meta, md));
      } catch {
        this.#indexes.delete(meta.id);
      }
    }
  }
}
