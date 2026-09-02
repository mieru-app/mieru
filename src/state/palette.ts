import type { ViewState } from "../core/types.js";

/**
 * ブランチ自動配色（F-24）。
 *
 * 色は第1階層のブランチにだけ付ける。全ノードに付けると、
 * どの枝がどの論点に属するのかという唯一の手掛かりが埋もれる。
 *
 * 仕様の正本: docs/design.md 7.1 の F-24
 */

/**
 * 既定パレット。アイコン（設計書 12.6）と同じ5色を使う。
 *
 * 並びは色相ではなく寒暖で交互にしてある。隣り合うブランチが似た色になると、
 * 枝を辿らずに「どの論点の話か」を見分けられなくなる。
 */
export const DEFAULT_PALETTE = ["#2F6BFF", "#FF6A00", "#00C2D1", "#FF2D6F", "#9B5CFF"];

/**
 * 第1階層のブランチに割り当てる色を、ブランチの数だけ返す。
 *
 * @param colors `"auto"` なら既定パレット。配列ならそれを使う（frontmatter の `mm.colors`）
 */
export function branchColors(colors: ViewState["colors"], count: number): string[] {
  const palette = colors === "auto" || colors.length === 0 ? DEFAULT_PALETTE : colors;
  // ブランチがパレットより多ければ色は巡る。使い切って無色になるよりはよい。
  // 添字で引かずに並べてから切るので、「色が付かないブランチ」が構造的に生じない
  const cycled: string[] = [];
  while (cycled.length < count) cycled.push(...palette);
  return cycled.slice(0, count);
}
