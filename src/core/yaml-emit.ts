import { parseDocument } from "yaml";

/**
 * YAML の出力（frontmatter 用）。
 *
 * 解析には `yaml` パッケージを使うが、出力は自前実装する。
 * ライブラリの stringify は引用符の付け方やフロー/ブロックの選択が
 * 入力に依存して揺れるため、バイト単位の冪等性を保証できないため。
 * Markdown 本体でパーサとシリアライザを非対称にしているのと同じ理由（docs/design.md 12.2）。
 *
 * 引用符は「必要なときだけ」付ける。常に付けても冪等ではあるが、
 * `created: 2026-09-01T10:00:00Z` のような値まで引用符だらけになり、
 * 人が読み書きするファイルとして読みにくくなるため。
 */

/**
 * 引用符なしで書けるかを、実際に読み戻して確認する。
 *
 * IMPORTANT: YAML の数値・真偽値の文法を正規表現で判定してはいけない。
 * 10進数だけでなく 16進（`0x0`）・8進（`0o7`）・特殊浮動小数（`.inf`）・
 * 桁区切り（`1_000`）などが数値として解釈され、文字列でなくなる。
 * 網羅を試みると必ず取りこぼすため、実際に使うパーサに判定させる。
 *
 * @param flow フローシーケンス `[a, b]` の要素として出力する場合は true
 */
function canEmitPlain(value: string, flow: boolean): boolean {
  // 前後の空白は平文では保持されず、改行は構造を壊す
  if (value === "" || value !== value.trim() || /[\n\r\t]/.test(value)) return false;

  // YAML 1.1 の真偽値。1.2 では文字列のままなので自前の解析は通るが、
  // Obsidian など 1.1 で読むツールでは真偽値になってしまう。
  // 相互運用のために引用符を付けておく（設計原則1: 他ツールとそのまま行き来できること）
  if (/^(y|n|yes|no|on|off)$/i.test(value)) return false;

  try {
    // parse() ではなく parseDocument() を使う。
    // parse() に logLevel:"silent" を渡すとエラーの送出まで抑止され、
    // `@` のような不正な平文がベストエフォートで通ってしまう。
    // エラーと警告は自分で検査する。
    const source = flow ? `[${value}]` : `v: ${value}`;
    const document = parseDocument(source, { logLevel: "silent" });
    if (document.errors.length > 0 || document.warnings.length > 0) return false;

    const parsed: unknown = document.toJS();
    if (flow) {
      return Array.isArray(parsed) && parsed.length === 1 && parsed[0] === value;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
    return (parsed as Record<string, unknown>)["v"] === value;
  } catch {
    return false;
  }
}

/** 二重引用符で囲んでエスケープする */
function quote(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

/** ブロックマッピングの値としてスカラーを出力する */
export function emitScalar(value: string): string {
  return canEmitPlain(value, false) ? value : quote(value);
}

/**
 * フローシーケンスを出力する。例: `[a, b]`
 * @param alwaysQuote 全要素を必ず引用符で囲む（パス ID のように数値に見える値を扱うため）
 */
export function emitFlowSequence(values: readonly string[], alwaysQuote = false): string {
  const items = values.map((v) => (!alwaysQuote && canEmitPlain(v, true) ? v : quote(v)));
  return `[${items.join(", ")}]`;
}
