/**
 * 指でマップを動かすかどうかの判定（2.7-6）。
 *
 * **`mind-elixir` のマップ移動はマウス専用である。** 実装が
 * `pointerType === "mouse"` で門番しており、指で触れても一切動かない。
 * 実機で確かめるまで気付かなかった（コードからは pointer イベントを
 * 使っていることまでしか読み取れない）。
 *
 * `move(dx, dy)` は公開されているので、指のときだけこちらで拾って渡す。
 * 判定だけ切り出してあるのは、条件が2つあり、**どちらを落としても
 * 「指で動かない」か「枝を掴めない」のどちらかが静かに起きる**ためである。
 */

export interface PanStart {
  /** `PointerEvent.pointerType` */
  pointerType: string;
  /**
   * 触れた先が地の部分か。
   *
   * 枝（`me-tpc`）と展開ボタン（`me-epd`）だけが `pointer-events` を持ち、
   * 内側の `.map-canvas` は持たない。**空き地に触れたときだけ入れ物そのものが
   * 対象になる**ので、呼ぶ側は `event.target === 入れ物` を渡せばよい。
   */
  onEmptyArea: boolean;
}

export function shouldStartPan(start: PanStart): boolean {
  // マウスは向こうが持っている。二重に動かすと速度が倍になる
  if (start.pointerType === "mouse") return false;
  // 枝の上から始まった操作は向こうの並べ替えのものである。取り合いにしない
  return start.onEmptyArea;
}
