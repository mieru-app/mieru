/**
 * GitHub のトークンを作るための案内（Phase 2.6-4）。
 *
 * **これは飾りではなく機能の一部である。** 本ツールの安全は「利用者が権限を
 * 絞れること」の上に成り立っており（設計書 8.7.2）、絞り方を伝えられなければ
 * その前提が崩れる。だから描画層に散らさず、ここに置いて検査できるようにする。
 *
 * 仕様の正本: docs/design.md 8.7.2 / 8.7.3
 */

/** Fine-grained PAT の作成画面。classic トークンの画面ではない */
export const GITHUB_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

export interface GuideStep {
  title: string;
  detail: string;
}

export const GITHUB_TOKEN_STEPS: readonly GuideStep[] = [
  {
    title: "マップ置き場にするリポジトリを用意する",
    detail:
      "Mieru 専用の新しいリポジトリを勧めます。非公開で構いません。" +
      "既存のリポジトリを使うと、トークンの届く範囲がそのぶん広くなります。",
  },
  {
    title: "Expiration（有効期限）を短めにする",
    detail: "切れたら入れ直すだけです。期限があること自体が、漏れたときの被害を区切ります。",
  },
  {
    title: "Repository access を「Only select repositories」にし、上のリポジトリだけを選ぶ",
    detail:
      "ここが最も重要です。この指定が、事故が起きたときに被害の届く範囲そのものになります。",
  },
  {
    title: "Permissions → Repository permissions の Contents を「Read and write」にする",
    detail:
      "他の項目は触らないでください。Metadata が自動で Read-only になりますが、これは GitHub が必須にしているもので、そのままで構いません。",
  },
  {
    title: "Generate token を押し、表示された文字列をここに貼る",
    detail: "この文字列は一度しか表示されません。画面を離れる前に貼ってください。",
  },
] as const;

/**
 * トークンの保管について利用者に伝えること。
 *
 * **言い換えでごまかさない。** 平文であることを伏せて「安全に保管します」と
 * 書くのは、対策済みだと思わせるぶん、何も書かないより悪い（設計書 8.7.2）。
 */
export const GITHUB_STORAGE_NOTE =
  "トークンはこの端末のブラウザ（IndexedDB）に平文で保存されます。" +
  "どこかのサーバへ送られることはありません。" +
  "共用の端末では「この端末に記憶する」を外してください。外すと、閉じた時点で消えます。";

/** 接続を解除したときに何が起きるか */
export const GITHUB_DISCONNECT_NOTE =
  "この端末からトークンを消します。リポジトリのマップは消えません。";
