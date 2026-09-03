/**
 * 行単位の差分（2.8-4）。
 *
 * **履歴の一覧だけでは戻す判断ができない。** 「14:32 の版」と言われても、
 * それが消す前なのか後なのかは中身を見るまで分からない。差分はそのための道具である。
 *
 * ライブラリを入れないのは、要るのが「行の追加と削除」だけであり、
 * 単語単位の差分も3方向マージも使い道が無いためである（CLAUDE.md「依存の追加は最小限」）。
 *
 * 判断ではなく計算なので `src/core/` でも成り立つが、あちらは
 * 「Markdown とモデルの相互変換」に限っている。差分は変換ではないのでこちらへ置く。
 */

export type DiffKind = "same" | "added" | "removed";

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

/**
 * 総当たりで突き合わせる上限（行数）。
 *
 * 突き合わせは行数の積に比例する。前後の一致部分を先に落としてから使うので、
 * 実際にここへ届くのは「文書の大半が別物になった」場合だけであり、
 * そのときは1行ずつ対応を探しても読める差分にはならない。
 */
const MAX_PAIRS = 1_000_000;

/** 末尾の改行で空行が1つ増えるのを避けて行へ分ける */
function toLines(md: string): string[] {
  if (md === "") return [];
  return md.replace(/\n$/, "").split("\n");
}

/**
 * 最長共通部分列を求め、差分の行へ展開する。
 *
 * @param before 変更前の行（前後の一致部分を落とした残り）
 * @param after 変更後の行
 */
function lcsDiff(before: readonly string[], after: readonly string[]): DiffLine[] {
  const rows = before.length;
  const cols = after.length;

  // 表が大きすぎるときは、丸ごと入れ替わったものとして扱う
  if (rows * cols > MAX_PAIRS) {
    return [
      ...before.map((text): DiffLine => ({ kind: "removed", text })),
      ...after.map((text): DiffLine => ({ kind: "added", text })),
    ];
  }

  // table[i][j] = before[i..] と after[j..] の共通部分列の長さ
  const table: number[][] = Array.from({ length: rows + 1 }, () =>
    new Array<number>(cols + 1).fill(0),
  );
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      const row = table[i];
      const next = table[i + 1];
      if (row === undefined || next === undefined) continue;
      row[j] =
        before[i] === after[j] ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (before[i] === after[j]) {
      out.push({ kind: "same", text: before[i] ?? "" });
      i += 1;
      j += 1;
      continue;
    }
    // 削除を先に出す。同じ場所の入れ替えが「消して足した」の順に並ぶ
    if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
      out.push({ kind: "removed", text: before[i] ?? "" });
      i += 1;
    } else {
      out.push({ kind: "added", text: after[j] ?? "" });
      j += 1;
    }
  }
  for (; i < rows; i += 1) out.push({ kind: "removed", text: before[i] ?? "" });
  for (; j < cols; j += 1) out.push({ kind: "added", text: after[j] ?? "" });
  return out;
}

/**
 * 2つの Markdown を行単位で突き合わせる。
 *
 * **前後の一致部分を先に落としてから突き合わせる。** マップの編集はたいてい
 * 「大きな文書のどこか一箇所」であり、丸ごと総当たりすると行数の積だけ時間がかかる。
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const from = toLines(before);
  const to = toLines(after);

  let head = 0;
  while (head < from.length && head < to.length && from[head] === to[head]) head += 1;

  let tail = 0;
  while (
    tail < from.length - head &&
    tail < to.length - head &&
    from[from.length - 1 - tail] === to[to.length - 1 - tail]
  ) {
    tail += 1;
  }

  return [
    ...from.slice(0, head).map((text): DiffLine => ({ kind: "same", text })),
    ...lcsDiff(from.slice(head, from.length - tail), to.slice(head, to.length - tail)),
    ...from.slice(from.length - tail).map((text): DiffLine => ({ kind: "same", text })),
  ];
}

/** 増えた行と減った行の数。一覧に「どれくらい違うか」を出すのに使う */
export function countChanges(lines: readonly DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === "added") added += 1;
    else if (line.kind === "removed") removed += 1;
  }
  return { added, removed };
}
