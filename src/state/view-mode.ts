/**
 * 主表示領域のモード（設計書 7.2・F-25）。
 *
 * **編集する画面は2つ、読む画面が1つである。** キャンバスとアウトラインは
 * 同じ木を別の形に描いたもので、どちらからも書き換えられる。Markdown は
 * 「保存されるバイト列そのもの」を出す読み取り専用の画面であり、
 * 原則1（`.md` が唯一の真実）を目で確かめるための手段として置いている。
 *
 * **一覧が嘘をつくと表示に辿り着けなくなる**ため、巡回の順・ツールバーに並ぶ順・
 * 押しボタンの字は、すべてこの1か所から出す（`keymap.ts` などと同じ扱い）。
 * 配列の順がそのまま `Ctrl+E` の行き先であり、ツールバーの並び順でもある。
 */

/** 先頭が既定。`Ctrl+E` はこの順に巡回する */
export const VIEW_MODES = ["canvas", "outline", "source"] as const;

export type ViewMode = (typeof VIEW_MODES)[number];

/** 押しボタンの字と、読み上げに使う名前 */
export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  canvas: "キャンバス",
  outline: "アウトライン",
  source: "Markdown",
};

/**
 * 狭い画面で使う短い字。
 *
 * **360px の画面には正式な名前が3つ入らない。** ☰ とロゴと ⚙ を除いた残りは
 * 約 180px しかなく、「キャンバス」「アウトライン」「Markdown」を並べると
 * 270px を超えて溢れる（2.7-1 で切り詰めた余白を足しても届かない）。
 * 正式な名前は `aria-label` と `title` で残すので、読み上げは変わらない。
 */
export const VIEW_MODE_SHORT_LABELS: Record<ViewMode, string> = {
  canvas: "図",
  outline: "リスト",
  source: "MD",
};

/**
 * 木を書き換えられる画面か。
 *
 * Markdown 表示は書き換えの入口を持たない。ノート欄と編集バーを出すかどうかも
 * これで決まる（`layout.ts`）。**判断はここにあり、描画層は結果を使うだけにする。**
 */
export function isEditableMode(mode: ViewMode): boolean {
  return mode !== "source";
}

/** `Ctrl+E` の行き先。端まで来たら先頭へ戻る */
export function nextViewMode(mode: ViewMode): ViewMode {
  const at = VIEW_MODES.indexOf(mode);
  return VIEW_MODES[(at + 1) % VIEW_MODES.length] ?? VIEW_MODES[0];
}
