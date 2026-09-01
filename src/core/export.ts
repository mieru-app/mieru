import { escapeInlineText, guardHeadingClose } from "./escape.js";
import { normalizeNoteText } from "./normalize.js";
import { serializeMarkdown } from "./serialize.js";
import { splitFrontmatter } from "./frontmatter.js";
import type { MapDoc, MapNode } from "./types.js";

/**
 * AI 入力用の Markdown 出力。
 *
 * いずれのモードでも frontmatter は出力しない。
 * 表示状態（折り畳み・配色）を AI に渡さないため（設計原則2）。
 *
 * 仕様の正本: docs/design.md 7.3
 */

export type ExportMode =
  /** モード1: 本文をそのまま。構造をコンパクトに伝えたいとき */
  | "raw"
  /** モード2（既定）: 第1〜3階層を見出しへ昇格。LLM が最も解釈しやすい形 */
  | "expanded"
  /** モード3: 選択ノードを起点とする部分木のみ。形式は expanded に準ずる */
  | "subtree";

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
 * expanded 形式で1ノードを出力する。
 * @param depth 起点ノードからの深さ。0 が起点（`#`）
 */
function emitExpanded(out: string[], node: MapNode, depth: number): void {
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
    emitExpanded(out, child, depth + 1);
  }
}

function exportExpanded(root: MapNode): string {
  const out: string[] = [];
  emitExpanded(out, root, 0);
  // 先頭の空行を落とし、連続する空行を1つにまとめる
  const body = out
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n{3,}/g, "\n\n");
  return `${body.replace(/[ \t]+$/gm, "").trimEnd()}\n`;
}

/** 保存形式の本文をそのまま返す（frontmatter のみ除去） */
function exportRaw(doc: MapDoc): string {
  const { body } = splitFrontmatter(serializeMarkdown(doc));
  return `${body.trimStart().trimEnd()}\n`;
}

export interface ExportOptions {
  /** subtree のときの起点ノードの構造パス。省略時はルート */
  fromPath?: string;
}

/**
 * AI へ渡す Markdown を生成する。
 *
 * @param mode 既定は expanded。LLM が最も文書として解釈しやすいため
 * @throws subtree で fromPath のノードが見つからない場合
 */
export function exportMarkdown(
  doc: MapDoc,
  mode: ExportMode = "expanded",
  options: ExportOptions = {},
): string {
  switch (mode) {
    case "raw":
      return exportRaw(doc);
    case "expanded":
      return exportExpanded(doc.root);
    case "subtree": {
      const from = findNodeByPath(doc.root, options.fromPath ?? "");
      if (from === undefined) {
        throw new Error(`部分出力の起点が見つかりません: ${options.fromPath ?? ""}`);
      }
      return exportExpanded(from);
    }
  }
}
