import type { List, ListItem, Node, RootContent } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { unescapeInlineText, unguardHeadingClose } from "./escape.js";
import { parseFrontmatter, splitFrontmatter } from "./frontmatter.js";
import { normalizeNoteText, splitEmoji } from "./normalize.js";
import { normalizeQuote, unescapeNote } from "./note.js";
import type { MapDoc, MapNode, ParseResult, ParseWarning } from "./types.js";

/**
 * Markdown → モデル の変換。
 *
 * ラベルとノートは mdast のインライン解析結果ではなく `position` から
 * 元ソースを切り出して取得する。強調やリンク記法を解釈せず逐語的に保持するため
 * （docs/design.md 6.3「インライン記法はラベル文字列としてそのまま保持し、解釈しない」）。
 *
 * 仕様の正本: docs/design.md 6.3
 */

const processor = unified().use(remarkParse);

/** 横断リンク `[[対象]]` */
const CROSS_LINK = /\[\[([^\]\n]+)\]\]/g;

function stripIndent(line: string, max: number): string {
  let i = 0;
  while (i < max && (line[i] === " " || line[i] === "\t")) i++;
  return line.slice(i);
}

/**
 * ブロックの元ソースを取り出し、継続行のインデントを取り除く。
 * mdast が保持する position を使うため、インライン記法は解釈されずそのまま残る。
 */
function rawBlockText(body: string, node: Node): string {
  const start = node.position?.start;
  const end = node.position?.end;
  if (start?.offset === undefined || end?.offset === undefined) return "";

  const indent = start.column - 1;
  return body
    .slice(start.offset, end.offset)
    .split("\n")
    .map((line, i) => (i === 0 ? line : stripIndent(line, indent)))
    .join("\n");
}

/** ラベルから横断リンクを収集する。ラベル文字列からは除去しない（可逆性のため） */
export function collectLinks(label: string): string[] {
  const links: string[] = [];
  for (const match of label.matchAll(CROSS_LINK)) {
    const target = match[1]?.trim();
    if (target !== undefined && target !== "") links.push(target);
  }
  return links;
}

function createNode(rawLabel: string, note?: string): MapNode {
  // **絵文字を外してからアンエスケープする。** 出力側は
  // 「ラベルをエスケープしてから絵文字を足す」順なので（`serialize.ts` の `labelLine`）、
  // 逆順にすると対にならない。`--- 🌏` のように、絵文字が付くと
  // エスケープ条件そのものが変わる並びがある（プロパティテストが見つけた）
  const split = splitEmoji(rawLabel.trim());
  const label = unescapeInlineText(split.label);
  const emoji = split.emoji;
  return {
    uid: crypto.randomUUID(),
    path: "",
    label,
    ...(emoji !== undefined ? { emoji } : {}),
    ...(note !== undefined ? { note } : {}),
    links: collectLinks(label),
    children: [],
  };
}

/** 構造パス（"1.0.2" 形式）を木全体に振り直す。ルートは空文字列 */
export function assignPaths(root: MapNode): void {
  const walk = (node: MapNode, prefix: string): void => {
    node.path = prefix;
    node.children.forEach((child, i) => {
      walk(child, prefix === "" ? String(i) : `${prefix}.${i}`);
    });
  };
  walk(root, "");
}

/**
 * 見出しの元ソースから `#` 記号を取り除く。
 * 行頭のアンエスケープは createNode 側で行う。ここは見出し行に固有の処理だけを担う。
 */
function headingText(body: string, node: Node): string {
  const line = rawBlockText(body, node)
    .replace(/^#{1,6}[ \t]*/, "")
    // CommonMark は閉じシーケンス（`# a #` の末尾）を取り除く。ここも合わせる
    .replace(/[ \t]+#+[ \t]*$/, "")
    .trim();
  // **自前で足した `\#` を外すのは、上の除去より後でなければならない。**
  // 先に外すと、守ったはずの `#` が閉じシーケンスとして消える
  return unguardHeadingClose(line);
}

function unsupported(node: RootContent | Node, what: string): ParseWarning {
  return {
    kind: "unsupported-element",
    message: `${what} は変換できないため破棄しました。`,
    ...(node.position?.start.line !== undefined ? { line: node.position.start.line } : {}),
  };
}

/**
 * 元ソースのノート断片をモデル上のノートへ変換する。
 *
 * **正規化してからアンエスケープする。** 出力側は正規化済みのノートへ
 * `escapeNote()` を掛けるため（`serialize.ts` の `pushNoteLines`）、
 * 逆順にすると対にならない。行頭の空白が残ったままでは足した `\` を見つけられない。
 */
function toNote(raw: string): string | undefined {
  const normalized = normalizeNoteText(raw);
  if (normalized === undefined) return undefined;
  return unescapeNote(normalized.split("\n")).join("\n");
}

/**
 * ノートへ入れられるブロックの元ソースを取り出す。入れられないものは undefined。
 *
 * **引用とコードは破棄しない。** `.md` が正本である以上、開いて保存しただけで
 * 他人の書いたものが消えてはいけない（2026-09-05 に追加）。
 * 引用は全行を `>` 始まりに揃える（`note.ts` の `normalizeQuote`）。
 */
function noteSource(body: string, node: Node & { type: string }): string | undefined {
  const raw = rawBlockText(body, node);
  if (node.type === "paragraph" || node.type === "code") return raw;
  if (node.type === "blockquote") return normalizeQuote(raw);
  return undefined;
}

/** 箇条書き項目1つをノードへ変換する */
function buildFromListItem(body: string, item: ListItem, warnings: ParseWarning[]): MapNode {
  const blocks: string[] = [];
  const childLists: List[] = [];
  // ラベルになるのは最初の「段落」であって、最初のブロックではない。
  // `- > q` のように引用で始まる項目はラベルを持たない
  let labelSource: string | undefined;

  for (const child of item.children) {
    if (child.type === "list") {
      childLists.push(child);
      continue;
    }
    const source = noteSource(body, child);
    if (source === undefined) {
      warnings.push(unsupported(child, `箇条書き内の ${child.type}`));
      continue;
    }
    if (labelSource === undefined && blocks.length === 0 && child.type === "paragraph") {
      labelSource = source;
      continue;
    }
    blocks.push(source);
  }

  // 最初の段落の1行目がラベル、2行目以降はノートの一部になる。
  // 遅延継続行（親箇条書きの内容列に揃えた行）は同じ段落として解析されるため。
  const first = labelSource ?? "";
  const newlineAt = first.indexOf("\n");
  const rawLabel = newlineAt === -1 ? first : first.slice(0, newlineAt);
  const restOfFirst = newlineAt === -1 ? "" : first.slice(newlineAt + 1);

  const noteParts = [restOfFirst, ...blocks].filter((p) => p.trim() !== "");
  const node = createNode(rawLabel, toNote(noteParts.join("\n\n")));

  for (const list of childLists) {
    for (const child of list.children) {
      node.children.push(buildFromListItem(body, child, warnings));
    }
  }
  return node;
}

/** ノードへノートを追記する */
function appendNote(node: MapNode, text: string): void {
  const addition = toNote(text);
  if (addition === undefined) return;
  node.note = node.note === undefined ? addition : `${node.note}\n\n${addition}`;
}

export interface ParseContext {
  /** ストア内での識別子。呼び出し側が持つため引数で受け取る */
  id?: string;
  /** 楽観ロック用の版。同上 */
  version?: string;
}

/**
 * Markdown をモデルへ変換する。
 *
 * 変換不可能な要素は破棄するが、必ず warnings に積んで呼び出し側へ返す。
 * 黙って捨ててはいけない（docs/design.md 11章）。
 */
export function parseMarkdown(source: string, ctx: ParseContext = {}): ParseResult {
  const warnings: ParseWarning[] = [];

  // 改行を LF に統一してから解析する（docs/design.md 6.1）。
  // CRLF のファイルを開いた場合は正規化され、保存時に LF で書き戻される。
  const { yaml, body, bodyStartLine } = splitFrontmatter(source.replace(/\r\n?/g, "\n"));
  const { data, warnings: fmWarnings } = parseFrontmatter(yaml);
  warnings.push(...fmWarnings);

  const tree = processor.parse(body);

  const root: MapNode = createNode(data.title ?? "");
  // level 0 がルート。見出し `## X` は level 1 として扱う（markmap 互換）
  const stack: { level: number; node: MapNode }[] = [{ level: 0, node: root }];
  let rootLabelSet = false;

  const currentNode = (): MapNode => stack[stack.length - 1]?.node ?? root;

  const pushHeading = (level: number, text: string): void => {
    while (stack.length > 1 && (stack[stack.length - 1]?.level ?? 0) >= level) {
      stack.pop();
    }
    const node = createNode(text);
    currentNode().children.push(node);
    stack.push({ level, node });
  };

  for (const child of tree.children) {
    switch (child.type) {
      case "heading": {
        const text = headingText(body, child);
        if (child.depth === 1 && !rootLabelSet) {
          // ルートは frontmatter の title で暫定初期化されているため、
          // H1 が見つかったら絵文字も含めて必ず上書きする（消し忘れると往復で増える）
          const built = createNode(text);
          root.label = built.label;
          if (built.emoji !== undefined) root.emoji = built.emoji;
          else delete root.emoji;
          root.links = built.links;
          rootLabelSet = true;
        } else {
          if (child.depth === 1) {
            warnings.push({
              kind: "multiple-h1",
              message: "H1 が複数あるため、2つ目以降は第1階層として扱いました。",
              ...(child.position?.start.line !== undefined
                ? { line: child.position.start.line + bodyStartLine }
                : {}),
            });
          }
          pushHeading(Math.max(1, child.depth - 1), text);
        }
        break;
      }

      case "list": {
        const target = currentNode();
        for (const item of child.children) {
          target.children.push(buildFromListItem(body, item, warnings));
        }
        break;
      }

      default: {
        // 見出し直下の地の文・引用・コードはノートとして保持する。
        // 破棄すると内容が失われるため
        const source = noteSource(body, child);
        if (source === undefined) warnings.push(unsupported(child, child.type));
        else appendNote(currentNode(), source);
      }
    }
  }

  if (!rootLabelSet && data.title === undefined) {
    warnings.push({
      kind: "missing-h1",
      message: "中心テーマ（H1）が見つかりませんでした。",
    });
  }

  // 警告の行番号を元ファイル基準へ補正する（frontmatter 由来の警告は補正済み）
  for (const warning of warnings) {
    if (warning.kind !== "invalid-frontmatter" && warning.kind !== "multiple-h1") {
      if (warning.line !== undefined) warning.line += bodyStartLine;
    }
  }

  assignPaths(root);

  const doc: MapDoc = {
    meta: {
      id: ctx.id ?? "",
      title: data.title ?? root.label,
      tags: data.tags,
      created: data.created ?? "",
      updated: data.updated ?? "",
      version: ctx.version ?? "",
    },
    root,
    view: data.view,
  };

  return { doc, warnings };
}
