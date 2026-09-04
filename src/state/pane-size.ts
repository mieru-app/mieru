/**
 * 一覧と欄の幅（2026-09-04 の実利用要望）。
 *
 * 幅を決めるのは判断であり、描画層に置くと検証できない（規約「層の分け方」）。
 * とくに**掴んだ指を右へ動かしたときにどちらの欄が広がるか**は、
 * 一覧（左）と欄（右）で符号が逆になる。ここを取り違えると、
 * 掴んだ向きと逆に伸びる欄ができる。
 *
 * 保存先は `localStorage`。マップごとの表示状態ではなく端末ごとの好みなので、
 * frontmatter の `mm:` には書かない（不変条件2）。配色（`theme.ts`）と同じ扱いである。
 */

export type Pane = "sidebar" | "panel";

/** `localStorage` の鍵。他のアプリと衝突しないよう接頭辞を付ける */
export const PANE_KEYS: Record<Pane, string> = {
  sidebar: "mieru.paneWidth.sidebar",
  panel: "mieru.paneWidth.panel",
};

/**
 * 既定と可動域（rem）。
 *
 * 下限は**中身が読める幅**で決めている。一覧は日付と鉛筆・✕ が並ぶので 10rem、
 * 欄はノートを書く場所なので 14rem を切ると1行が数語になる。
 * 上限は**主表示が潰れない幅**である。両方を最大にしても 70rem 残る。
 */
const LIMITS: Record<Pane, { min: number; max: number; initial: number }> = {
  sidebar: { min: 10, max: 30, initial: 15 },
  panel: { min: 14, max: 40, initial: 20 },
};

export function defaultPaneWidth(pane: Pane): number {
  return LIMITS[pane].initial;
}

/** 可動域へ収める。小数第1位まで（`0.1rem` 未満の差は見えない） */
export function clampPaneWidth(pane: Pane, rem: number): number {
  const { min, max } = LIMITS[pane];
  if (!Number.isFinite(rem)) return LIMITS[pane].initial;
  return Math.round(Math.min(max, Math.max(min, rem)) * 10) / 10;
}

/**
 * 保存された値を読む。
 *
 * **壊れた値でも既定へ倒す。** `localStorage` は利用者や他のツールが
 * 書き換えられる場所であり、読めない値で画面が崩れてはいけない（`theme.ts` と同じ方針）。
 */
export function readPaneWidth(pane: Pane, stored: string | null): number {
  if (stored === null) return defaultPaneWidth(pane);
  const value = Number.parseFloat(stored);
  if (!Number.isFinite(value)) return defaultPaneWidth(pane);
  return clampPaneWidth(pane, value);
}

/**
 * 掴んで動かした結果の幅。
 *
 * **一覧は右へ動かすと広がり、欄は左へ動かすと広がる。**
 * 欄は画面の右端にあるので、境目を左へ引くほど欄が広くなる。
 *
 * @param startRem 掴んだ時点の幅
 * @param deltaPx 掴んだ位置からの移動量（右が正）
 * @param rootFontPx `1rem` の画素数。既定は 16
 */
export function resizePane(pane: Pane, startRem: number, deltaPx: number, rootFontPx = 16): number {
  const base = rootFontPx > 0 ? rootFontPx : 16;
  const direction = pane === "sidebar" ? 1 : -1;
  return clampPaneWidth(pane, startRem + (direction * deltaPx) / base);
}
