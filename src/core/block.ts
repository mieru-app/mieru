import { classifyNoteLines } from "./note.js";

/**
 * ノート本文のブロック記法（Phase 2.10-4）。
 *
 * **保存形式には触れない。** ノートは逐語の文字列としてモデルに入っており、
 * ここはそれを「見える形」に組み替えるだけである。
 *
 * | 書いたもの | ノートに入るか |
 * |---|---|
 * | 段落（空行区切り）・表・折り返し行 | 入る |
 * | **引用・コードブロック** | **入る**（2026-09-05 に破棄をやめた） |
 * | 番号付きリスト | 入らない。**子ノードになる** |
 * | `#` 見出し・水平線 | 入らない。破棄され警告が積まれる |
 *
 * **塊の切り分けは `note.ts` に任せる。** 保存側と表示側で別々に判断すると、
 * 「保存はできているのに画面に出ない」という食い違いが起きる。
 *
 * 表は `remark-gfm` を入れていないため段落として解析され、ノートへ逐語で入る
 * （`CLAUDE.md`）。**禁止の理由は解析が変わって表が破棄されることであり、
 * 表示を自前で組むのは禁止に触れない。**
 *
 * 当時の計画は 2.10-4 の置き場所を `inline.ts` としていたが、
 * インラインではないので別ファイルにした。層は同じである。
 */

/** 表の桁の寄せ方 */
export type CellAlign = "left" | "center" | "right";

export interface ParagraphBlock {
  kind: "paragraph";
  /** 空行を挟まない連続した行。各行にインライン記法が含まれうる */
  lines: string[];
}

export interface TableBlock {
  kind: "table";
  header: string[];
  /** `header` と同じ長さ */
  align: CellAlign[];
  rows: string[][];
}

export interface QuoteBlock {
  kind: "quote";
  /** `>` を外した中身。各行にインライン記法が含まれうる */
  lines: string[];
}

export interface CodeBlock {
  kind: "code";
  /** 柵の情報文字列。無ければ undefined */
  lang?: string;
  /** 柵やインデントを外した中身。**インライン記法として解釈してはいけない** */
  text: string;
}

export type NoteBlock = ParagraphBlock | TableBlock | QuoteBlock | CodeBlock;

/** 区切り行。`|---|:--:|--:|` のような行 */
const DELIMITER = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;

/** 1行を桁へ割る。外側の `|` は桁を作らない */
function cellsOf(line: string): string[] {
  const trimmed = line.trim();
  const inner = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((cell) => cell.trim());
}

function alignOf(cell: string): CellAlign {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  return right ? "right" : "left";
}

/**
 * 連続した行の塊が表かどうか。
 *
 * **2行目が区切り行であることを条件にする**（GFM と同じ）。
 * 1行目だけで決めると、`A | B` と書いた普通の文が表になる。
 */
function isTable(lines: readonly string[]): boolean {
  const second = lines[1];
  if (lines.length < 2 || second === undefined) return false;
  const first = lines[0] ?? "";
  if (!first.includes("|")) return false;
  if (!DELIMITER.test(second.trim())) return false;

  /*
   * **見出しが全て空の表は表として扱わない。**
   * `|` と `-` だけの2行がここへ来ると、桁の無い空の表が描かれ、
   * 利用者が書いた文字が画面から消える。段落として残す方が良い
   * （2026-09-04、プロパティテストが `["|", "-"]` で見つけた）。
   */
  return cellsOf(first).some((cell) => cell !== "");
}

function toTable(lines: readonly string[]): TableBlock {
  const header = cellsOf(lines[0] ?? "");
  const align = cellsOf(lines[1] ?? "").map(alignOf);
  const rows = lines.slice(2).map((line) => {
    const cells = cellsOf(line);
    // 桁数が合わない行は見出しに合わせる。足りなければ空、多ければ捨てる（GFM と同じ）
    return header.map((_, at) => cells[at] ?? "");
  });

  return {
    kind: "table",
    header,
    align: header.map((_, at) => align[at] ?? "left"),
    rows,
  };
}

/** 引用の各行から `>` と続く空白1つを外す */
function toQuote(lines: readonly string[]): QuoteBlock {
  return { kind: "quote", lines: lines.map((line) => line.replace(/^>[ \t]?/, "")) };
}

/** 柵付きコード。1行目と最終行が柵 */
function toFencedCode(lines: readonly string[]): CodeBlock {
  const info = (lines[0] ?? "").replace(/^(`{3,}|~{3,})/, "").trim();
  const body = lines.slice(1, -1);
  return { kind: "code", ...(info === "" ? {} : { lang: info }), text: body.join("\n") };
}

/** インデントコード。全ての行が半角4つで始まる */
function toIndentedCode(lines: readonly string[]): CodeBlock {
  return { kind: "code", text: lines.map((line) => line.replace(/^ {4}/, "")).join("\n") };
}

/**
 * ノート本文をブロックへ分ける。
 *
 * **どこが塊かは `note.ts` が決める。** 保存側と同じ判断を使わないと、
 * 「保存はできているのに画面に出ない」食い違いが起きる。
 *
 * 表と判定できなかった塊は、そのまま段落として返す。**捨てない。**
 * 書いたものが画面から消えるのが最も困る。
 */
export function parseBlocks(note: string): NoteBlock[] {
  const lines = note.split("\n");
  const info = classifyNoteLines(lines);
  const blocks: NoteBlock[] = [];

  for (let at = 0; at < lines.length; at++) {
    const block = info[at]?.block ?? -1;
    if (block === -1) continue;

    let end = at;
    while (end + 1 < lines.length && (info[end + 1]?.block ?? -1) === block) end += 1;
    const group = lines.slice(at, end + 1);
    at = end;

    if (info[at]?.kind === "text") {
      blocks.push(isTable(group) ? toTable(group) : { kind: "paragraph", lines: group });
    } else if ((group[0] ?? "").startsWith(">")) {
      blocks.push(toQuote(group));
    } else if (/^(`{3,}|~{3,})/.test(group[0] ?? "")) {
      blocks.push(toFencedCode(group));
    } else {
      blocks.push(toIndentedCode(group));
    }
  }

  return blocks;
}
