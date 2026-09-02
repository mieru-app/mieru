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
 * **色を持つのは M・e（＝me、自分）と u（＝you、相手）だけ。** 「見える」の目的語が
 * 自分と相手であり、その2つのあいだで思考を繋ぐ道具である、という名前の由来を
 * そのまま塗り分けにしている。i と r は墨のままで、地の明暗に追従する。
 *
 * この置き方は、色の付く字のあいだに必ず墨の字が挟まる形になっており、
 * 「色どうしを直接隣接させない」というアイコンの規則（12.6）を自然に満たす。
 * 経緯と選定の記録は docs/design.md 12.7。
 */

/** アイコン（12.6）と同じ5色のうち、ここで使う2色 */
const ME = "#2F6BFF";
const YOU = "#FF6A00";

/** 字画と、その色。null は `currentColor`（地に応じた墨色） */
const STROKES: [string, string | null][] = [
  // M（me）
  ["M 40 240 L 40 40 L 125 172 L 210 40 L 210 240", ME],
  // i（点は別に置く）
  ["M 278 100 L 278 240", null],
  // e（me）: 中央のバーから上・左・下と305度回り、右下で開ける
  ["M 346 170 L 486 170 A 70 70 0 1 0 456 227", ME],
  // r
  ["M 554 100 L 554 240", null],
  ["M 554 155 A 52 52 0 0 1 606 103", null],
  // u（you）。右の縦線は継ぎ目を隠すため2本に分けて重ねる
  ["M 651 100 L 651 205 A 35 35 0 0 0 721 205 L 721 100", YOU],
  ["M 721 205 L 721 240", YOU],
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
      {/* 点は墨。色を持つのは me と you だけにする */}
      <circle cx="278" cy="58" r="17" fill="currentColor" />
    </svg>
  );
}
