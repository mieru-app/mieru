/**
 * 配色の選択（2-12 の設定画面）。
 *
 * 既定は `system`。OS の設定に従うのが最も驚きが少なく、
 * 「暗いところで使うと眩しい」といった調整はブラウザではなく OS でまとめて行うのが普通である。
 * それでも上書きを持たせるのは、片方の配色でしか使わない外部ツールと
 * 並べて作業するときに揃えたくなるためである。
 */

export type Theme = "system" | "light" | "dark";

/** localStorage の鍵。他のアプリと衝突しないよう接頭辞を付ける */
export const THEME_KEY = "mieru.theme";

/**
 * 保存されていた値を配色として読む。
 *
 * 知らない値は `system` に倒す。localStorage は利用者や他のツールが
 * 書き換えられる場所であり、壊れた値で画面が真っ白になってはいけない。
 */
export function readTheme(stored: string | null): Theme {
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

/**
 * 押しボタンに並べる順。**言葉は文言表が持つ**（`strings/ja.ts` の `settings`）。
 * ここが持つのは順序だけである。
 */
export const THEMES: Theme[] = ["system", "light", "dark"];
