import { escapeInlineText, guardHeadingClose } from "./escape.js";
import { normalizeNoteText } from "./normalize.js";
import { serializeBody } from "./serialize.js";
import type { MapDoc, MapNode } from "./types.js";

/**
 * テキスト出力（AI へ渡す Markdown の生成）。
 *
 * どの形式でも frontmatter は出力しない。
 * 表示状態（折り畳み・配色）を AI に渡さないため（設計原則2）。
 *
 * **範囲（全体／選択部分）はここに持ち込まない。** 受け取るのは
 * 「どのノードから出すか」という構造パスだけである。「いま選択中かどうか」は
 * 編集状態であって変換の入力ではないため、`src/state/` が解決する。
 *
 * 仕様の正本: docs/design.md 7.3
 */

export type ExportFormat =
  /** 既定。第1〜3階層を見出しへ昇格させる。LLM が最も文書として解釈しやすい形 */
  | "heading"
  /** 保存形式の本文そのまま。構造を短く伝えたいとき */
  | "bullet";

/** 見出しへ昇格させる最大の階層。これより深いものは箇条書きで出力する */
const MAX_HEADING_DEPTH = 3;

/** 構造パス（"1.0.2" 形式）でノードを探す。空文字列はルート */
export function findNodeByPath(root: MapNode, path: string): MapNode | undefined {
  if (path === "") return root;
  let current: MapNode | undefined = root;
  for (const segment of path.split(".")) {
    const index = Number(segment);
    if (!Number.isInteger(index)) return undefined;
    current = current?.children[index];
    if (current === undefined) return undefined;
  }
  return current;
}

function labelOf(node: MapNode): string {
  const label = escapeInlineText(node.label.replace(/[\r\n]+/g, " ").trim());
  if (node.emoji === undefined || node.emoji === "") return label;
  return label === "" ? node.emoji : `${label} ${node.emoji}`;
}

function pushNote(out: string[], node: MapNode, indent: string): void {
  const note = node.note === undefined ? undefined : normalizeNoteText(node.note);
  if (note === undefined) return;
  if (indent === "") out.push("");
  for (const line of note.split("\n")) {
    out.push(line === "" ? "" : indent + escapeInlineText(line));
  }
}

/**
 * 見出し形式で1ノードを出力する。
 * @param depth 起点ノードからの深さ。0 が起点（`#`）
 */
function emitHeading(out: string[], node: MapNode, depth: number): void {
  if (depth <= MAX_HEADING_DEPTH) {
    // 見出しの末尾の `#` は閉じシーケンスとして失われるため保護する
    const label = guardHeadingClose(labelOf(node));
    const hashes = "#".repeat(depth + 1);
    out.push("");
    out.push(label === "" ? hashes : `${hashes} ${label}`);
    pushNote(out, node, "");
  } else {
    // 第4階層以降は箇条書き。見出しを深くしすぎると文書として読みにくくなるため
    const indent = "  ".repeat(depth - MAX_HEADING_DEPTH - 1);
    const label = labelOf(node);
    // 見出しの直後に箇条書きが続く場合は空行で区切る
    if (indent === "" && out[out.length - 1] !== "") out.push("");
    out.push(label === "" ? `${indent}-` : `${indent}- ${label}`);
    pushNote(out, node, `${indent}  `);
  }

  for (const child of node.children) {
    emitHeading(out, child, depth + 1);
  }
}

function exportHeading(root: MapNode): string {
  const out: string[] = [];
  emitHeading(out, root, 0);
  // 先頭の空行を落とし、連続する空行を1つにまとめる
  const body = out
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n{3,}/g, "\n\n");
  return `${body.replace(/[ \t]+$/gm, "").trimEnd()}\n`;
}

/** 保存形式の本文をそのまま返す。保存と同じ関数を通すことで両者が食い違わない */
function exportBullet(root: MapNode): string {
  return `${serializeBody(root).trimEnd()}\n`;
}

export interface ExportOptions {
  /** 起点ノードの構造パス。省略時はルート（＝全体） */
  fromPath?: string;
}

/**
 * AI へ渡す Markdown を生成する。
 *
 * @param format 既定は heading。LLM が最も文書として解釈しやすいため
 * @throws fromPath のノードが見つからない場合
 */
export function exportMarkdown(
  doc: MapDoc,
  format: ExportFormat = "heading",
  options: ExportOptions = {},
): string {
  const from = findNodeByPath(doc.root, options.fromPath ?? "");
  if (from === undefined) {
    throw new Error(`部分出力の起点が見つかりません: ${options.fromPath ?? ""}`);
  }
  return format === "heading" ? exportHeading(from) : exportBullet(from);
}
