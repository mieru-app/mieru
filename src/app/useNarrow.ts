import { useSyncExternalStore } from "react";

import { NARROW_MAX_WIDTH } from "../state/layout.js";

/**
 * 画面が「1ペインしか置けない幅」かどうかを測る（2.7-1）。
 *
 * **測るだけで、そこから何を出すかは決めない。** 判断は `src/state/layout.ts` にある。
 * 境目の値もそちらが持つ。ここは `matchMedia` を React に繋ぐだけの層である。
 */

const QUERY = `(max-width: ${NARROW_MAX_WIDTH})`;

let list: MediaQueryList | null = null;

/** 使うときに1つだけ作る。描画のたびに作ると監視の付け外しが噛み合わない */
function mediaQuery(): MediaQueryList {
  list ??= window.matchMedia(QUERY);
  return list;
}

function subscribe(onChange: () => void): () => void {
  const target = mediaQuery();
  target.addEventListener("change", onChange);
  return () => target.removeEventListener("change", onChange);
}

function narrow(): boolean {
  return mediaQuery().matches;
}

export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, narrow, () => false);
}

/**
 * 初期値として同期的に読む。
 *
 * サイドバーの初期状態を決めるのに使う。狭い画面で開いた状態から始めると、
 * 起動した瞬間に一覧が全面を覆う。
 */
export function isNarrowNow(): boolean {
  return typeof window !== "undefined" && narrow();
}
