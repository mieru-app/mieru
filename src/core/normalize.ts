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

/**
 * ラベル末尾の絵文字を分ける。
 *
 * **IMPORTANT: パーサとシリアライザが同じ関数を使う。**
 * 解析側だけが分けていたため、`0  ⁉`（空白2つ）のように
 * ラベル自身が末尾に絵文字を含む形が、出力では逐語のまま、
 * 読み戻すと空白1つに詰まり、**強保証が破れていた**
 * （2026-09-05、プロパティテストを 25 万件へ上げて発見）。
 */
/** ラベル末尾の絵文字（異体字セレクタ・ZWJ 連結を含む）を捉える */
const TRAILING_EMOJI = /[ \t]+(\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)$/u;

/** ラベルから末尾の絵文字を分離する */
export function splitEmoji(label: string): { label: string; emoji?: string } {
  const match = TRAILING_EMOJI.exec(label);
  if (match?.[1] === undefined) return { label };
  return { label: label.slice(0, match.index).trimEnd(), emoji: match[1] };
}
