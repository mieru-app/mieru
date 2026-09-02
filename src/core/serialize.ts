import { escapeInlineText, guardHeadingClose } from "./escape.js";
import { serializeFrontmatter } from "./frontmatter.js";
import { normalizeNoteText } from "./normalize.js";
import type { MapDoc, MapNode } from "./types.js";

/**
 * モデル → Markdown の変換。
 *
 * 出力は正規化規則（docs/design.md 6.4）に厳密に従う。
 * 同じモデルからは常にバイト単位で同一の Markdown が生成されなければならない。
 * ここが揺れると冪等性が崩れ、「開いて保存しただけで内容が変わる」ことになる。
 *
 * 仕様の正本: docs/design.md 6.4
 */

/** 1階層あたりのインデント */
const INDENT = "  ";

/** ラベル行を組み立てる。ラベル内の改行は空白に潰す（1行に収める必要があるため） */
function labelLine(node: MapNode): string {
  const label = escapeInlineText(node.label.replace(/[\r\n]+/g, " ").trim());
  if (node.emoji === undefined || node.emoji === "") return label;
  return label === "" ? node.emoji : `${label} ${node.emoji}`;
}

/**
 * ノートの行を出力する。空行はインデントを付けない（行末空白を残さないため）。
 * 渡す文字列は正規化済みであること。
 */
function pushNoteLines(out: string[], note: string, indent: string): void {
  for (const line of note.split("\n")) {
    out.push(line === "" ? "" : indent + escapeInlineText(line));
  }
}

function emitNode(out: string[], node: MapNode, depth: number): void {
  const indent = INDENT.repeat(depth);
  let label = labelLine(node);
  let note = node.note === undefined ? undefined : normalizeNoteText(node.note);

  // ラベルが空でノートだけを持つ状態は Markdown では表現できない。
  // 空の箇条書き `-` の次行は継続行ではなく新しい段落として解析され、
  // 読み込み時にラベルへ昇格してしまうため。
  // ここでノートの1行目をラベルへ繰り上げ、出力を解析結果と一致させる。
  if (label === "" && note !== undefined) {
    const newlineAt = note.indexOf("\n");
    label = escapeInlineText(newlineAt === -1 ? note : note.slice(0, newlineAt));
    note = newlineAt === -1 ? undefined : normalizeNoteText(note.slice(newlineAt + 1));
  }

  if (label === "") {
    // 空の箇条書きは段落を中断できない（CommonMark）。直前の行に続けて書くと
    // 兄弟・子ではなく親の段落の遅延継続行として吸収されてしまうため、
    // 空行で区切って独立したブロックにする。
    if (out[out.length - 1] !== "") out.push("");
    out.push(`${indent}-`);
  } else {
    out.push(`${indent}- ${label}`);
  }

  if (note !== undefined) {
    // 箇条書きの内容列（= インデント + 2）に揃えると遅延継続行として
    // 同じ段落に取り込まれ、解析時にノートとして復元できる
    pushNoteLines(out, note, indent + INDENT);
  }

  for (const child of node.children) {
    emitNode(out, child, depth + 1);
  }
}

/**
 * 本文（frontmatter を除く部分）を組み立てる。
 * 渡したノードを `#` の見出しとし、子孫を箇条書きにする。末尾に改行は付けない。
 *
 * 保存だけでなく、テキスト出力の「箇条書き」形式もここを通す（設計書 7.3）。
 * 出力用に書き直すと正規化規則が片方だけ古くなり、
 * 「保存した `.md` と出力した `.md` が違う」という気づきにくい食い違いが起きる。
 */
export function serializeBody(root: MapNode): string {
  const out: string[] = [];

  const rootLabel = guardHeadingClose(labelLine(root));
  out.push(rootLabel === "" ? "#" : `# ${rootLabel}`);

  // ルートのノートは見出し直下の地の文として出力する。
  // 箇条書きの中ではないため、ラベルへの繰り上げは不要
  const rootNote = root.note === undefined ? undefined : normalizeNoteText(root.note);
  if (rootNote !== undefined) {
    out.push("");
    pushNoteLines(out, rootNote, "");
  }

  if (root.children.length > 0) {
    out.push("");
    for (const child of root.children) {
      emitNode(out, child, 0);
    }
  }

  return out.join("\n").replace(/[ \t]+$/gm, "");
}

/**
 * モデルを Markdown 文字列へ変換する。
 * 戻り値は必ず改行1つで終端する。
 */
export function serializeMarkdown(doc: MapDoc): string {
  const frontmatter = serializeFrontmatter(doc.meta, doc.view);
  return `${frontmatter}\n${serializeBody(doc.root)}\n`;
}
