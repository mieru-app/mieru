/**
 * 文字ロゴ「Mieru」（2.5-7）。
 *
 * アイコン（設計書 12.6）と同じ骨格で描く。単線・丸端・丸継ぎで、
 * M の谷はアイコンと同じく上から66%の位置にある。字面はすべて直線と正円で、
 * フォントには依存しない（依存を足さずに、どの環境でも同じ形が出る）。
 *
 * 基準線は cap 40 / x-height 100 / baseline 240、線幅 34。
 * 丸端は基準線から ±17 はみ出すため、字面の実際の上下端は 23 と 257 になる。
 *
 * **色を置くのは M と e と点だけ。** 残りは `currentColor` で、地の明暗に追従する。
 * 5文字すべてを塗る案も試したが、アイコンの規則（設計書 12.6）が
 * 「色どうしを直接隣接させない」「色の面積を不均等にする」と定めており、
 * 全部塗るとその逆になる。経緯と選定の記録は docs/design.md 12.7。
 */

/** アイコンと同じ5色のうち、ここで使う2色 */
const BLUE = "#2F6BFF";
const ORANGE = "#FF6A00";

/** 字画と、その色。null は `currentColor`（地に応じた墨色） */
const STROKES: [string, string | null][] = [
  // M
  ["M 40 240 L 40 40 L 125 172 L 210 40 L 210 240", BLUE],
  // i（点は別に置く）
  ["M 278 100 L 278 240", null],
  // e: 中央のバーから上・左・下と305度回り、右下で開ける
  ["M 346 170 L 486 170 A 70 70 0 1 0 456 227", ORANGE],
  // r
  ["M 554 100 L 554 240", null],
  ["M 554 155 A 52 52 0 0 1 606 103", null],
  // u（右の縦線は継ぎ目を隠すため2本に分けて重ねる）
  ["M 651 100 L 651 205 A 35 35 0 0 0 721 205 L 721 100", null],
  ["M 721 205 L 721 240", null],
];

interface Props {
  /** 読み上げ名。近くに「Mieru」の文字がある場所では空にして重複を避ける */
  label?: string;
}

export function Wordmark({ label = "Mieru" }: Props): React.JSX.Element {
  return (
    <svg
      className="wordmark"
      viewBox="0 23 781 234"
      role={label === "" ? "presentation" : "img"}
      aria-label={label === "" ? undefined : label}
      aria-hidden={label === "" ? true : undefined}
    >
      <g fill="none" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round">
        {STROKES.map(([d, color]) => (
          <path key={d} d={d} stroke={color ?? "currentColor"} />
        ))}
      </g>
      <circle cx="278" cy="58" r="17" fill={BLUE} />
    </svg>
  );
}
