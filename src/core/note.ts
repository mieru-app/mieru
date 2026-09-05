import { escapeNoteLine, unescapeNoteLine } from "./escape.js";

/**
 * ノート本文の行の扱いを決める。
 *
 * **ノートは Markdown の断片である。** 行頭にブロック記法が来たとき、
 * 扱いは2つに割れる。
 *
 * | 行頭 | 逐語で出すと | 扱い |
 * |---|---|---|
 * | `#` `- ` `1. ` `---` `<` `[a]:` | **子ノードや見出しになる＝木が変わる** | エスケープする |
 * | `>` 柵 4スペース | ノートの中の形しか変えない | **逐語で出す** |
 *
 * 前者を逃すと枝が増減し、後者を潰すと**他人が書いた引用とコードが消える**。
 * 2026-09-04 までは後者を全て破棄していた（`.md` が正本である以上、これは
 * 開いて保存しただけで内容が失われることを意味する）。
 *
 * 仕様の正本: `docs/design/data-format.md` 6.4
 */

/** 逐語で出す行か、エスケープしてよい本文行か */
export type NoteLineKind = "text" | "verbatim";

export interface NoteLine {
  kind: NoteLineKind;
  /**
   * 同じ塊に属する行は同じ番号を持つ。空行は `-1`。
   *
   * **番号が変わる境目には空行が要る。** 解析側はブロックごとに元ソースを
   * 取り出して `\n\n` で繋ぐため、出力側が空行を入れないと
   * 「段落＋引用」が「引用1つ（遅延継続）」として読み戻され、往復しない
   * （2026-09-05、プロパティテストが `"> quote\n!"` で見つけた）。
   */
  block: number;
}

/** コードフェンスの開始行。```` ``` ```` でも `~~~` でもよい */
const FENCE = /^(`{3,}|~{3,})(.*)$/;

/** インデントコード。半角4つ以上で始まる行 */
const INDENTED = /^ {4}/;

interface Fence {
  char: string;
  length: number;
}

function fenceOpen(line: string): Fence | undefined {
  const match = FENCE.exec(line);
  const marker = match?.[1];
  const info = match?.[2];
  if (marker === undefined || info === undefined) return undefined;
  // 逆引用符の柵は情報文字列に逆引用符を含められない（CommonMark）
  const char = marker[0] ?? "";
  if (char === "`" && info.includes("`")) return undefined;
  return { char, length: marker.length };
}

/** 閉じ柵は同じ文字・同じ長さ以上で、情報文字列を持たない */
function isFenceClose(line: string, open: Fence): boolean {
  const match = FENCE.exec(line);
  const marker = match?.[1];
  if (marker === undefined || (marker[0] ?? "") !== open.char) return false;
  return marker.length >= open.length && (match?.[2] ?? "").trim() === "";
}

/**
 * ノートの各行を分類する。
 *
 * **対になっていない柵は逐語で出せない。**
 * 閉じない柵は、後続の行を——子ノードまで——コードの中身として飲み込む
 * （2026-09-05 に実測。`- 子` が丸ごと消えた）。よって本文行として扱い、
 * エスケープして文字にする。
 */
export function classifyNoteLines(lines: readonly string[]): NoteLine[] {
  const out: NoteLine[] = lines.map(() => ({ kind: "text", block: -1 }));
  let block = 0;

  const mark = (from: number, to: number, kind: NoteLineKind): void => {
    for (let i = from; i <= to; i++) out[i] = { kind, block };
    block += 1;
  };

  for (let at = 0; at < lines.length; at++) {
    const line = lines[at] ?? "";

    if (line.trim() === "") continue;

    const open = fenceOpen(line);
    if (open !== undefined) {
      let close = -1;
      for (let i = at + 1; i < lines.length; i++) {
        if (isFenceClose(lines[i] ?? "", open)) {
          close = i;
          break;
        }
      }
      if (close !== -1) {
        mark(at, close, "verbatim");
        at = close;
        continue;
      }
      // 対が無い柵は逐語で出せない。本文行としてエスケープし、文字にする
    }

    if (line.startsWith(">")) {
      // 続く `>` の行までが1つの引用
      let end = at;
      while (end + 1 < lines.length && (lines[end + 1] ?? "").startsWith(">")) end += 1;
      mark(at, end, "verbatim");
      at = end;
      continue;
    }

    /*
     * **インデントコードは段落を中断できない。**
     * 直前が空行（か先頭）のときだけコードになる。直前が本文行なら
     * それは遅延継続行であり、逐語で出すと段落へ吸われて往復しない
     * （2026-09-05 に実測）。
     */
    if (INDENTED.test(line) && (at === 0 || (lines[at - 1] ?? "").trim() === "")) {
      // 途中の空行はコードを途切れさせない。4スペースの行が続く限り同じ塊である
      let end = at;
      for (let i = at; i < lines.length; i++) {
        const next = lines[i] ?? "";
        if (next.trim() === "") continue;
        if (!INDENTED.test(next)) break;
        end = i;
      }
      mark(at, end, "verbatim");
      at = end;
      continue;
    }

    // 段落。ここでは番号を振らず、逐語の塊を全て決めた後でまとめる
  }

  /*
   * 残りは段落。**空行と逐語の塊だけが段落を切る。**
   * 本文行はエスケープされて必ず段落の続きになるので、
   * 行頭が `#` でも `- ` でも同じ段落のままである
   */
  for (let at = 0; at < lines.length; at++) {
    if ((lines[at] ?? "").trim() === "" || (out[at]?.block ?? -1) >= 0) continue;
    let end = at;
    while (end + 1 < lines.length) {
      const next = lines[end + 1] ?? "";
      if (next.trim() === "" || (out[end + 1]?.block ?? -1) >= 0) break;
      end += 1;
    }
    mark(at, end, "text");
    at = end;
  }

  return out;
}

/** ノートの先頭が逐語のインデントコードかどうか。出力側で空行を挟む判断に使う */
export function startsWithIndentedCode(note: string): boolean {
  const lines = note.split("\n");
  return classifyNoteLines(lines)[0]?.kind === "verbatim" && INDENTED.test(lines[0] ?? "");
}

/**
 * 引用の全ての行を `>` で始まる形に揃える。
 *
 * CommonMark は `> q` の次行が `lazy` でも同じ引用として読む（遅延継続行）。
 * **そのままモデルへ入れると、行だけを見て引用と判断できなくなる。**
 * ここで揃えておけば「`>` で始まる行が引用」と1行だけで決められる。
 */
export function normalizeQuote(raw: string): string {
  return raw
    .split("\n")
    .map((line) => (line.startsWith(">") ? line : `> ${line}`))
    .join("\n");
}

/** 本文行だけをエスケープする。逐語行には触れない */
export function escapeNote(lines: readonly string[]): string[] {
  const info = classifyNoteLines(lines);
  return lines.map((line, at) => (info[at]?.kind === "text" ? escapeNoteLine(line) : line));
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((line, at) => line === b[at]);
}

/**
 * `escapeNote()` が足した `\` だけを取り除く。
 *
 * **判定はノート全体で行う。** `escape.ts` と同じ「外してからもう一度足すと
 * 元に戻るか」だが、柵が対かどうかは1行だけでは決まらないため、
 * 確認の単位を1行からノートへ上げてある。
 *
 * これにより2つが自動的に正しくなる。
 *
 * - `\> q` は**外さない**。外すと引用になり、他人が書いた「文字としての `>`」が化ける
 * - 対の無い `\``` ` は**外す**。モデルでは裸の柵、ファイルでは `\``` ` と、
 *   どちらも動かない
 */
export function unescapeNote(lines: readonly string[]): string[] {
  const info = classifyNoteLines(lines);
  const bare = lines.map((line, at) => (info[at]?.kind === "text" ? unescapeNoteLine(line) : line));
  if (same(escapeNote(bare), lines)) return bare;

  // 全部を一度に外すと戻らない場合は、1行ずつ「外しても戻るもの」だけ採る
  const out = lines.slice();
  for (let at = 0; at < lines.length; at++) {
    if (info[at]?.kind !== "text") continue;
    const trial = out.slice();
    trial[at] = unescapeNoteLine(lines[at] ?? "");
    if (trial[at] !== out[at] && same(escapeNote(trial), lines)) out[at] = trial[at] ?? "";
  }
  return out;
}
