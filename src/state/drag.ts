import type { DropPosition } from "./tree.js";

/**
 * 掴んで落とす操作の判断（2.9-3）。
 *
 * **ここには「どこへ落ちるか」だけを置く。** 木がどう変わるかは `tree.ts`、
 * 実際に離したときの適用は `editor.ts` にある。
 * 画素と割合の計算を描画層へ書くと、境目を変えたときに検証できない
 * （規約「描画層に判断を書かない」）。
 *
 * **アウトラインは掴み手（グリップ）から掴む方式にした。** キャンバスと違い
 * 一覧は指で縦に送る面であり、長押しで掴む方式にすると送る操作と competing する。
 * グリップだけ `touch-action` を切れば、行の他の場所は今までどおり送れる。
 * 掴めることが画面を見て分かる利点もある（設計書 7.2.1 の「入力手段があることが
 * 画面を見ても分からない」への対処）。
 */

/**
 * 行の上下これだけの割合を「兄弟として差し込む」帯にする。
 * 残りの中央は「子にする」帯になる。
 *
 * **3等分にしていないのは、子にする操作の方が狙いにくいからである。**
 * 兄弟への差し込みは隣の行の帯と連続しており、少しずれても意図した側に落ちる。
 */
const EDGE_RATIO = 0.3;

/**
 * 行の中のどこで離したかから、落とす位置を決める。
 *
 * @param offsetY 行の上端からの距離（画素）
 * @param height 行の高さ（画素）
 */
export function resolveDropPosition(offsetY: number, height: number): DropPosition {
  // 高さが取れないときは兄弟として後ろへ。子にしてしまうと階層が勝手に深くなる
  if (!Number.isFinite(height) || height <= 0) return "after";

  const ratio = Math.min(Math.max(offsetY / height, 0), 1);
  if (ratio < EDGE_RATIO) return "before";
  if (ratio > 1 - EDGE_RATIO) return "after";
  return "inside";
}

/**
 * 掴んでからこれだけ動いたらドラッグとみなす（画素）。
 *
 * **0 にしてはいけない。** 押して離すだけの操作が毎回ドラッグになり、
 * グリップを触っただけで木が動く。
 */
export const DRAG_START_PX = 4;

/** 掴んだ地点からの距離。ドラッグに入るかの判定に使う */
export function movedFar(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_START_PX;
}
