/**
 * ノート文字列の正規化。
 *
 * IMPORTANT: パーサとシリアライザは必ずこの同じ関数を使うこと。
 * 片方だけが正規化していると、空白のみのノートなどが往復で消えたり
 * 空行が増殖したりして冪等性が崩れる。
 *
 * 行頭の空白は Markdown ではインデントコードブロックに化けるため
 * 逐語的に保持できない。ここで落とすことを正規化規則として明示している
 * （docs/design.md 6.4）。
 */
export function normalizeNoteText(text: string): string | undefined {
  const normalized = text
    // 改行は LF に統一する
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    // 連続する空行は1つにまとめる（箇条書きの継続が途切れるのを防ぐ）
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized === "" ? undefined : normalized;
}
