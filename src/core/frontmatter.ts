import { parseDocument } from "yaml";

import type { MapMeta, ParseWarning, ViewState } from "./types.js";
import { DEFAULT_VIEW_STATE } from "./types.js";
import { emitFlowSequence, emitScalar } from "./yaml-emit.js";

/**
 * frontmatter の入出力。
 *
 * 表示状態（折り畳み・配色）は `mm:` 配下にのみ格納する。
 * 本文へ書き出してはならない（設計原則2）。AI に渡す本文を汚さないための隔離である。
 *
 * 仕様の正本: docs/design.md 6.1
 */

/** frontmatter から読み取ったファイル固有の情報 */
export interface FrontmatterData {
  title?: string;
  tags: string[];
  created?: string;
  updated?: string;
  view: ViewState;
}

export interface SplitResult {
  /** frontmatter の中身。存在しない場合は null */
  yaml: string | null;
  /** frontmatter を除いた本文 */
  body: string;
  /** 本文が元の文字列の何行目（0 始まり）から始まるか。警告の行番号補正に使う */
  bodyStartLine: number;
}

/**
 * 先頭の frontmatter ブロックを本文から切り離す。
 *
 * `remark-frontmatter` を使わず自前で行う。判定条件を完全に把握しておきたいことと、
 * 依存を増やさないため（CLAUDE.md「依存の追加は最小限」）。
 */
export function splitFrontmatter(source: string): SplitResult {
  if (!source.startsWith("---\n") && source !== "---" && !source.startsWith("---\r\n")) {
    return { yaml: null, body: source, bodyStartLine: 0 };
  }

  const lines = source.split("\n");
  // lines[0] は "---"。閉じの "---" を探す
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trimEnd() === "---") {
      return {
        yaml: lines.slice(1, i).join("\n"),
        body: lines.slice(i + 1).join("\n"),
        bodyStartLine: i + 1,
      };
    }
  }

  // 閉じが見つからない場合は frontmatter とみなさない
  return { yaml: null, body: source, bodyStartLine: 0 };
}

/** 値が文字列配列なら文字列配列として返す。そうでなければ空配列 */
function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * frontmatter の YAML を解析する。
 * 解釈できない場合は既定値を返し、警告を積む（黙って捨てない）。
 */
export function parseFrontmatter(yaml: string | null): {
  data: FrontmatterData;
  warnings: ParseWarning[];
} {
  const empty: FrontmatterData = { tags: [], view: { ...DEFAULT_VIEW_STATE } };
  if (yaml === null || yaml.trim() === "") {
    return { data: empty, warnings: [] };
  }

  // parseDocument を使い、エラーを例外ではなく値として受け取る。
  // logLevel:"silent" は警告のコンソール出力を抑えるためだけに指定している
  const document = parseDocument(yaml, { logLevel: "silent" });
  if (document.errors.length > 0) {
    return {
      data: empty,
      warnings: [
        {
          kind: "invalid-frontmatter",
          message: `frontmatter を YAML として解釈できませんでした: ${
            document.errors[0]?.message ?? "不明なエラー"
          }`,
          line: 1,
        },
      ],
    };
  }

  let raw: unknown;
  try {
    raw = document.toJS() as unknown;
  } catch {
    return {
      data: empty,
      warnings: [
        {
          kind: "invalid-frontmatter",
          message: "frontmatter の構造を解釈できませんでした。既定値を使用します。",
          line: 1,
        },
      ],
    };
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      data: empty,
      warnings: [
        {
          kind: "invalid-frontmatter",
          message: "frontmatter がマッピングではありません。既定値を使用します。",
          line: 1,
        },
      ],
    };
  }

  const record = raw as Record<string, unknown>;
  const mm = (
    typeof record["mm"] === "object" && record["mm"] !== null && !Array.isArray(record["mm"])
      ? record["mm"]
      : {}
  ) as Record<string, unknown>;

  const colors: ViewState["colors"] =
    Array.isArray(mm["colors"]) && mm["colors"].every((c) => typeof c === "string")
      ? mm["colors"]
      : "auto";

  return {
    data: {
      ...(asString(record["title"]) !== undefined ? { title: asString(record["title"]) } : {}),
      tags: asStringArray(record["tags"]),
      ...(asString(record["created"]) !== undefined
        ? { created: asString(record["created"]) }
        : {}),
      ...(asString(record["updated"]) !== undefined
        ? { updated: asString(record["updated"]) }
        : {}),
      view: { collapsed: asStringArray(mm["collapsed"]), colors },
    },
    warnings: [],
  };
}

/**
 * frontmatter を出力する。
 *
 * キー順は title → tags → created → updated → mm に固定する。
 * 空配列・既定値は省略する。これにより同じモデルからは常に同一のバイト列が得られる
 * （docs/design.md 6.4）。
 *
 * @returns 末尾に改行を含む frontmatter ブロック。出力すべき内容が無い場合は空文字列
 */
export function serializeFrontmatter(meta: MapMeta, view: ViewState): string {
  const lines: string[] = [];

  lines.push(`title: ${emitScalar(meta.title)}`);
  if (meta.tags.length > 0) {
    lines.push(`tags: ${emitFlowSequence(meta.tags)}`);
  }
  if (meta.created !== "") {
    lines.push(`created: ${emitScalar(meta.created)}`);
  }
  if (meta.updated !== "") {
    lines.push(`updated: ${emitScalar(meta.updated)}`);
  }

  // mm は既定値から外れている項目だけを出力する。
  // 既定状態のマップに無意味な制御情報が残らないようにするため。
  const mmLines: string[] = [];
  if (view.collapsed.length > 0) {
    // パス ID は "1.0" のように数値に見えるため常に引用符で囲む
    mmLines.push(`  collapsed: ${emitFlowSequence(view.collapsed, true)}`);
  }
  if (view.colors !== "auto") {
    mmLines.push(`  colors: ${emitFlowSequence(view.colors)}`);
  }
  if (mmLines.length > 0) {
    lines.push("mm:", ...mmLines);
  }

  return `---\n${lines.join("\n")}\n---\n`;
}
