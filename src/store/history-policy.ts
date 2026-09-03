/**
 * 履歴を何件・どの間隔で残すかの判断（2.8-3）。
 *
 * **これを持たないと履歴は使い物にならない。** 自動保存は入力停止から 800ms で
 * 走るため（設計書 F-31）、保存のたびに素直に控えると 30分の編集で 100件を超え、
 * 一覧が「3秒前・5秒前・8秒前」で埋まる。目当ての版を探せない一覧は、
 * 無いのと同じである。
 *
 * 記録するかどうかは判断であって保存操作ではないので、純粋関数として切り出す。
 * 保存先の実装（`IdbHistoryStore`）はこの結果に従うだけにする。
 */

/** この時間内に続けて保存されたものは、1つの版にまとめる */
export const COALESCE_MS = 5 * 60_000;

/** 1マップあたりの版数の上限。5分に1版なので、およそ4時間ぶんの編集が残る */
export const MAX_ENTRIES = 50;

/**
 * 1マップあたりの履歴の大きさの上限（UTF-8 バイト）。
 *
 * 版数だけで抑えると、大きなマップでは 50版で数十MB になる。IndexedDB の
 * 割り当ては保存先ではなくブラウザが決めるもので、使い切ると**退避
 * （`quarantine.ts`）まで書けなくなる。** 控えのために正本を守る仕組みを
 * 潰しては本末転倒なので、こちらにも上限を置く。
 */
export const MAX_BYTES = 2_000_000;

/** 版をどう書くか */
export type HistoryDecision =
  /** 新しい版として足す */
  | "append"
  /** 直前の版を今の内容で置き換える。まとめる場合 */
  | "replace"
  /** 何もしない。内容が変わっていない場合 */
  | "skip";

export interface HistoryDecisionInput {
  /** 直前に控えた版。1件も無ければ null */
  previous: {
    /**
     * **その版をまとめ始めた時刻。** 取り込んだ最新の時刻ではない。
     *
     * ここを最新の時刻にすると、まとめるたびに窓が先へずれ、**編集を続けている限り
     * 5分が永久に来ない。** 30分打ち続けても版が1つしか残らなくなる。
     */
    since: number;
    md: string;
  } | null;
  /** これから控えようとしている内容 */
  md: string;
  /** 保存した時刻（エポックミリ秒） */
  at: number;
}

/**
 * 版を足すか、直前を置き換えるか、何もしないか。
 *
 * 内容が同じなら何もしない。**保存が走っても中身が変わらないことはある**
 * （折り畳みを開いて閉じた、外部変更を読み直した後にすぐ保存された、など）。
 * 同じ内容の版が並ぶと、一覧を見て「どこで何が変わったか」が読めなくなる。
 */
export function decideHistoryWrite(input: HistoryDecisionInput): HistoryDecision {
  const { previous } = input;
  if (previous === null) return "append";
  if (previous.md === input.md) return "skip";
  /*
   * 窓はその版を**まとめ始めた時刻**から測る。時計が巻き戻った場合
   * （端末の時刻合わせ、日をまたぐ手動変更）も置き換えに倒す。
   * 差を絶対値で見ないのは、巻き戻りを「遠い過去」と読んで版を増やすより、
   * 直前へまとめる方が一覧の並びが壊れないためである。
   */
  return input.at - previous.since < COALESCE_MS ? "replace" : "append";
}

/**
 * 上限に収まるよう古い版から捨てる。
 *
 * @param entries 古い順に並んだ版
 * @returns 残す版。古い順のまま
 */
export function trimHistory<T extends { md: string }>(entries: readonly T[]): T[] {
  // 末尾（新しい方）から詰めていき、どちらかの上限に触れたところで止める
  const kept: T[] = [];
  let bytes = 0;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry === undefined) continue;
    const size = byteLength(entry.md);
    // 最新の1件は、上限を超えていても必ず残す。
    // 大きなマップで1件も控えられない状態を作らないため
    if (kept.length > 0 && (kept.length >= MAX_ENTRIES || bytes + size > MAX_BYTES)) break;
    kept.push(entry);
    bytes += size;
  }
  return kept.reverse();
}

/** UTF-8 のバイト数。Markdown は文字数ではなくバイトで保存される */
export function byteLength(md: string): number {
  return new TextEncoder().encode(md).length;
}
