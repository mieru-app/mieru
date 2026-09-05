import { describe, expect, it } from "vitest";

import {
  disconnectNote,
  GITHUB_TOKEN_STEPS,
  GITHUB_TOKEN_URL,
  storageNote,
} from "../github-guide.js";
import type { Strings } from "../strings/ja.js";
import { EN } from "../strings/en.js";
import { JA } from "../strings/ja.js";

/**
 * トークン作成の案内の検証。
 *
 * **この文面は機能の一部である。** 本ツールの安全は「利用者が権限を絞れること」に
 * 依存しており（設計書 8.7.2）、絞り方の説明が抜け落ちれば前提ごと崩れる。
 * 説明が痩せていくのを機械的に止めるために検査する。
 *
 * **両方の言語で確かめる**（2.12）。片方の言語だけ安全の説明が抜けると、
 * その言語の利用者だけが広すぎる権限のトークンを作る。
 */

const TABLES: [string, Strings][] = [
  ["ja", JA],
  ["en", EN],
];

/** 言語ごとに、必ず出てくるべき言い回し */
const MUST_SAY: Record<string, { steps: string[]; storage: string[]; disconnect: string[] }> = {
  ja: {
    steps: ["専用"],
    storage: ["平文", "送られる", "共用"],
    disconnect: ["トークン", "消えません"],
  },
  en: {
    steps: ["just for Mieru"],
    storage: ["plain text", "never sent", "shared machine"],
    disconnect: ["token", "stay where they are"],
  },
};

function stepText(s: Strings): string {
  return GITHUB_TOKEN_STEPS.map((step) => `${step.title(s)}\n${step.detail(s)}`).join("\n");
}

describe("トークン作成の案内", () => {
  it("Fine-grained PAT の作成画面を指す", () => {
    // classic トークンの画面（/tokens/new）ではリポジトリ単位に絞れない
    expect(GITHUB_TOKEN_URL).toBe("https://github.com/settings/personal-access-tokens/new");
  });

  for (const [name, table] of TABLES) {
    /**
     * **GitHub の画面の字はそのまま出す。** 訳すと、利用者が探す先の
     * ボタンと違う名前になり、案内として成立しない。
     */
    it(`${name}: 権限を絞る手順を必ず含む`, () => {
      const text = stepText(table);
      // 被害の範囲を決めるのはこの2つ。どちらが抜けても案内として成立しない
      expect(text).toContain("Only select repositories");
      expect(text).toContain("Read and write");
      expect(text).toContain("Contents");
      expect(text).toContain("Expiration");
    });

    it(`${name}: 専用リポジトリを勧める`, () => {
      for (const phrase of MUST_SAY[name]?.steps ?? []) {
        expect(stepText(table)).toContain(phrase);
      }
    });

    it(`${name}: 案内文に強調記法を混ぜない（そのまま表示するため）`, () => {
      for (const step of GITHUB_TOKEN_STEPS) {
        expect(step.title(table)).not.toContain("**");
        expect(step.detail(table)).not.toContain("**");
      }
    });

    /**
     * 「安全に保管します」と書くのは、対策済みだと思わせるぶん
     * 何も書かないより悪い。
     */
    it(`${name}: 平文であること・送られないこと・共用端末での外し方に触れる`, () => {
      for (const phrase of MUST_SAY[name]?.storage ?? []) {
        expect(storageNote(table)).toContain(phrase);
      }
    });

    it(`${name}: 解除するとトークンだけが消え、マップは消えないと伝える`, () => {
      for (const phrase of MUST_SAY[name]?.disconnect ?? []) {
        expect(disconnectNote(table)).toContain(phrase);
      }
    });
  }
});
