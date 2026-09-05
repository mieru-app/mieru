import type { Strings } from "./strings/ja.js";

/**
 * GitHub のトークンを作るための案内（Phase 2.6-4）。
 *
 * **これは飾りではなく機能の一部である。** 本ツールの安全は「利用者が権限を
 * 絞れること」の上に成り立っており（設計書 8.7.2）、絞り方を伝えられなければ
 * その前提が崩れる。だから描画層に散らさず、ここに置いて検査できるようにする。
 *
 * **文言は文言表が持つ**（`strings/ja.ts` の `githubGuide`）。ここが持つのは
 * 手順の並びと、画面の場所である。**訳が抜けると型検査が落ちる**ので、
 * 片方の言語だけ手順が減ることが起きない。
 *
 * 仕様の正本: docs/design.md 8.7.2 / 8.7.3
 */

/** Fine-grained PAT の作成画面。classic トークンの画面ではない */
export const GITHUB_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

export interface GuideStep {
  title: (s: Strings) => string;
  detail: (s: Strings) => string;
}

export const GITHUB_TOKEN_STEPS: readonly GuideStep[] = [
  {
    title: (s) => s.githubGuide.repoTitle,
    detail: (s) => s.githubGuide.repoDetail,
  },
  {
    title: (s) => s.githubGuide.expiryTitle,
    detail: (s) => s.githubGuide.expiryDetail,
  },
  {
    title: (s) => s.githubGuide.accessTitle,
    detail: (s) => s.githubGuide.accessDetail,
  },
  {
    title: (s) => s.githubGuide.contentsTitle,
    detail: (s) => s.githubGuide.contentsDetail,
  },
  {
    title: (s) => s.githubGuide.generateTitle,
    detail: (s) => s.githubGuide.generateDetail,
  },
] as const;

/**
 * トークンの置き場所についての注意。
 *
 * **平文で持つことを隠さない。** 隠して使わせるより、危険を承知のうえで
 * 権限を絞ってもらう方が実際の安全に繋がる（設計書 8.7.2）。
 */
export const storageNote = (s: Strings): string => s.githubGuide.storageNote;

/** 接続を解除したときに何が消えるか。マップは消えないことを明示する */
export const disconnectNote = (s: Strings): string => s.githubGuide.disconnectNote;
