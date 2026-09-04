import { useCallback, useRef } from "react";

import type { Pane } from "../state/pane-size.js";
import { defaultPaneWidth, resizePane } from "../state/pane-size.js";

/**
 * 一覧と欄の幅を掴んで変える境目（2026-09-04 の実利用要望）。
 *
 * **`.workarea` の中に絶対配置で1つずつ置く。** 列として挟むと
 * `grid-template-columns` が4通りとも変わり、狭い画面の畳み方（2.7-1）まで
 * 波及する。境目は見た目の上に重ねるだけにして、格子には触らない。
 *
 * **幅の計算は `src/state/pane-size.ts` にある。** ここは掴んで離すまでの
 * 出来事を拾って渡すだけにする（規約「描画層に判断を書かない」）。
 */

interface Props {
  pane: Pane;
  /** 現在の幅（rem） */
  width: number;
  onResize: (width: number) => void;
  label: string;
}

/** 矢印キー1回で動かす量（rem）。掴めない環境でも幅を変えられるようにする（原則4） */
const STEP = 1;

export function PaneResizer({ pane, width, onResize, label }: Props): React.JSX.Element {
  /** 掴んだ時点の幅と位置。掴んでいる間だけ持つ */
  const grabbed = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  const rootFontPx = (): number =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // 掴むのは主ボタンだけ。右クリックでメニューを出す邪魔をしない
      if (event.button !== 0 && event.pointerType === "mouse") return;
      grabbed.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [width],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const grab = grabbed.current;
      if (grab === null || grab.pointerId !== event.pointerId) return;
      onResize(resizePane(pane, grab.startWidth, event.clientX - grab.startX, rootFontPx()));
    },
    [pane, onResize],
  );

  const onPointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (grabbed.current?.pointerId !== event.pointerId) return;
    grabbed.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // 画素ではなく rem で動かすので、`1rem` の画素数は渡さなくてよい
      const step = event.key === "ArrowLeft" ? -STEP : event.key === "ArrowRight" ? STEP : 0;
      if (step !== 0) {
        event.preventDefault();
        onResize(resizePane(pane, width, step * 16));
        return;
      }
      // 掴んで戻せなくなったときの逃げ道。既定へ戻す
      if (event.key === "Home") {
        event.preventDefault();
        onResize(defaultPaneWidth(pane));
      }
    },
    [pane, width, onResize],
  );

  return (
    <div
      className={`pane-resizer is-${pane}`}
      style={{ [pane === "sidebar" ? "left" : "right"]: `${String(width)}rem` }}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      // 掴んで見失ったときに元へ戻す手段。二度押しで既定へ
      onDoubleClick={() => onResize(defaultPaneWidth(pane))}
    />
  );
}
