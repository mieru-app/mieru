import { classifyNoteLines } from "./note.js";

/**
 * ノート文字列の正規化。
 *
 * IMPORTANT: パーサとシリアライザは必ずこの同じ関数を使うこと。
 * 片方だけが正規化していると、空白のみのノートなどが往復で消えたり
 * 空行が増殖したりして冪等性が崩れる。
 *
 * **逐語行（引用・柵の中・インデントコード）には触れない**（`note.ts`）。
 * 行頭の空白を落とすとコードのインデントが死に、空行を詰めるとコードの
 * 見た目が変わる。本文行だけを整える。
 */
export function normalizeNoteText(text: string): string | undefined {
  const source = text.replace(/\r\n?/g, "\n").split("\n");

  // 本文行の前後の空白を落とす。**逐語行は触らない**（コードのインデントが死ぬ）。
  // 落とすと分類が変わりうる（`  > q` は詰めると引用になる）ので、
  // 塊の切れ目は詰めた後の姿で数え直す
  const first = classifyNoteLines(source);
  const lines = source.map((line, at) => (first[at]?.kind === "verbatim" ? line : line.trim()));
  const info = classifyNoteLines(lines);

  const out: string[] = [];
  let previousBlock = -1;
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at] ?? "";
    const block = info[at]?.block ?? -1;

    if (line.trim() === "" && info[at]?.kind !== "verbatim") {
      // 連続する空行は1つにまとめる（箇条書きの継続が途切れるのを防ぐ）
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      continue;
    }

    // **塊が変わる境目には必ず空行を入れる。**
    // 入れないと「段落＋引用」が引用1つとして読み戻され、往復しない
    if (previousBlock !== -1 && block !== previousBlock && out[out.length - 1] !== "") {
      out.push("");
    }
    out.push(line);
    previousBlock = block;
  }

  // 前後の空行だけを落とす。**全体を trim すると先頭のコードのインデントが消える**
  while (out.length > 0 && (out[0] ?? "").trim() === "") out.shift();
  while (out.length > 0 && (out[out.length - 1] ?? "").trim() === "") out.pop();

  return out.length === 0 ? undefined : out.join("\n");
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
