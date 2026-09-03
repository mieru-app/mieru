import { describe, expect, it } from "vitest";

import {
  GITHUB_DISCONNECT_NOTE,
  GITHUB_STORAGE_NOTE,
  GITHUB_TOKEN_STEPS,
  GITHUB_TOKEN_URL,
} from "../github-guide.js";

/**
 * トークン作成の案内の検証。
 *
 * **この文面は機能の一部である。** 本ツールの安全は「利用者が権限を絞れること」に
 * 依存しており（設計書 8.7.2）、絞り方の説明が抜け落ちれば前提ごと崩れる。
 * 説明が痩せていくのを機械的に止めるために検査する。
 */

describe("トークン作成の案内", () => {
  it("Fine-grained PAT の作成画面を指す", () => {
    // classic トークンの画面（/tokens/new）ではリポジトリ単位に絞れない
    expect(GITHUB_TOKEN_URL).toBe("https://github.com/settings/personal-access-tokens/new");
  });

  it("権限を絞る手順を必ず含む", () => {
    const text = GITHUB_TOKEN_STEPS.map((step) => `${step.title}\n${step.detail}`).join("\n");
    // 被害の範囲を決めるのはこの2つ。どちらが抜けても案内として成立しない
    expect(text).toContain("Only select repositories");
    expect(text).toContain("Read and write");
    expect(text).toContain("Contents");
  });

  it("有効期限と、専用リポジトリを勧めることに触れる", () => {
    const text = GITHUB_TOKEN_STEPS.map((step) => `${step.title}\n${step.detail}`).join("\n");
    expect(text).toContain("Expiration");
    expect(text).toContain("専用");
  });

  it("案内文に強調記法を混ぜない（そのまま表示するため）", () => {
    for (const step of GITHUB_TOKEN_STEPS) {
      expect(step.title).not.toContain("**");
      expect(step.detail).not.toContain("**");
    }
  });
});

describe("保管についての説明", () => {
  it("平文であることを伏せない", () => {
    // 「安全に保管します」と書くのは、対策済みだと思わせるぶん何も書かないより悪い
    expect(GITHUB_STORAGE_NOTE).toContain("平文");
  });

  it("サーバへ送られないことと、共用端末での外し方に触れる", () => {
    expect(GITHUB_STORAGE_NOTE).toContain("送られる");
    expect(GITHUB_STORAGE_NOTE).toContain("共用");
  });

  it("解除するとトークンだけが消え、マップは消えないと伝える", () => {
    expect(GITHUB_DISCONNECT_NOTE).toContain("トークン");
    expect(GITHUB_DISCONNECT_NOTE).toContain("消えません");
  });
});
