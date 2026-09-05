import { create } from "zustand";

import { EN } from "./strings/en.js";
import { JA } from "./strings/ja.js";
import type { Strings } from "./strings/ja.js";

/**
 * 表示言語（2.12）。
 *
 * **配色（`theme.ts`）や欄の幅（`pane-size.ts`）と同じ「端末ごとの好み」である。**
 * マップの内容ではないので frontmatter の `mm:` には書かない（不変条件2）。
 * 保存先は `localStorage`。
 *
 * **訳し漏れは型検査で落ちる。** 日本語表の形をそのまま英語表の型にしてあるため、
 * 鍵を足して片方だけ書くとビルドが通らない（`strings/en.ts`）。
 * 実行時に鍵の存在を確かめる必要が無い。
 *
 * **翻訳ライブラリを入れない。** 2言語・静的な表・複数形なしという条件では、
 * 型付きのオブジェクトで足りる（依存の追加は最小限に。`CLAUDE.md`）。
 */

export type Language = "ja" | "en";

/** localStorage の鍵。他のアプリと衝突しないよう接頭辞を付ける */
export const LANGUAGE_KEY = "mieru.language";

const TABLES: Record<Language, Strings> = { ja: JA, en: EN };

/**
 * 表示言語を決める。
 *
 * **既定は英語で、ブラウザの言語は見ない。** 公開先は世界であり、
 * 日本語は選べる選択肢のひとつという位置づけにする。
 * 端末ごとに一度選べば記憶される（`theme.ts` と同じ扱い）。
 *
 * 知らない値は既定へ倒す。`localStorage` は利用者や他のツールが書き換えられる場所で、
 * 壊れた値で画面が真っ白になってはいけない。
 */
export function readLanguage(stored: string | null): Language {
  return stored === "ja" || stored === "en" ? stored : "en";
}

interface LanguageState {
  language: Language;
  /** いまの言語の文言表。画面はこれだけを読む */
  s: Strings;
  setLanguage: (next: Language) => void;
}

/**
 * **ストアにするのは、文言が画面のほぼ全ての要素に要るためである。**
 * props で配ると30個以上の部品に同じ引数が増え、
 * 「渡し忘れた枝だけ英語のまま」が起きる。
 */
export const useLanguage = create<LanguageState>()((set) => ({
  language: "en",
  s: EN,
  setLanguage: (next) => {
    set({ language: next, s: TABLES[next] });
  },
}));

/** 画面の外にも言語を伝える。読み上げと自動翻訳の判断に使われる */
export function applyLanguage(language: Language): void {
  document.documentElement.lang = language;
}

export const LANGUAGE_LABELS: { language: Language; label: string }[] = [
  // **自分の言語で書く。** 読めない言語で書かれた選択肢は選べない
  { language: "en", label: "English" },
  { language: "ja", label: "日本語" },
];
