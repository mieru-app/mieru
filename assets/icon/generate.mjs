/**
 * アイコンの生成。
 *
 *   node assets/icon/generate.mjs
 *
 * 採用案「放射する光条」。文字マーク M を白抜きにし、暗い地の中心に置く。
 * その外側から5色の光条を放射させる。光条の幅は不揃いにしてある
 * （均等に割ると回る風車に見えて散漫になる）。
 * 配色の根拠とこの形に至った経緯は docs/design.md 12.6 にある。
 *
 * 出力先は public/icons/（生成物なので Git 管理外）。
 * Vite が public/ を素通しで配るため、manifest とファビコンはここを参照する。
 * `npm run build` と `npm run dev` は事前にこのスクリプトを実行する。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = path.join(root, "public", "icons");

/** 地。白との比 19:1 を確保し、白抜きの M を無条件に読めるようにする */
const GROUND = "#0A0F1F";
/**
 * 光条。地との比 4.2〜8.8:1。M が地の上にしか乗らないため、
 * 白抜きの可読性を気にせず明度を落とさずに済む。
 */
const BEAM = {
  blue: "#2F6BFF",
  cyan: "#00C2D1",
  orange: "#FF6A00",
  pink: "#FF2D6F",
  violet: "#9B5CFF",
};

/** 光条の配置。[開始角, 終了角, 色]。角度は真上を 0 として時計回り */
const BEAMS = [
  [10, 64, BEAM.blue],
  [78, 116, BEAM.cyan],
  [132, 198, BEAM.orange],
  [214, 256, BEAM.pink],
  [274, 346, BEAM.violet],
];
const PAPER = "#FFFFFF";

const SIZE = 512;
const CENTER = SIZE / 2;

const toRad = (deg) => ((deg - 90) * Math.PI) / 180;
const point = (r, deg) =>
  `${(CENTER + r * Math.cos(toRad(deg))).toFixed(1)} ${(CENTER + r * Math.sin(toRad(deg))).toFixed(1)}`;

/**
 * 中心から放射する光条（内側を欠いた扇形）。
 *
 * 内半径は M の外接半径（約198）より大きく取る。M を地の上だけに乗せることで、
 * 光条の明度を落とさずに白抜きの可読性を確保できる（設計書 12.6）。
 */
function beam(fromDeg, toDeg, inner = 215, outer = 760) {
  return [
    `M ${point(inner, fromDeg)}`,
    `L ${point(outer, fromDeg)}`,
    `A ${outer} ${outer} 0 0 1 ${point(outer, toDeg)}`,
    `L ${point(inner, toDeg)}`,
    `A ${inner} ${inner} 0 0 0 ${point(inner, fromDeg)}`,
    "Z",
  ].join(" ");
}

/**
 * アイコンの SVG。
 *
 * @param scale 図案の縮尺。maskable 用に少し縮めた版を作るために使う
 */
function icon(scale = 1) {
  const transform =
    scale === 1
      ? ""
      : ` transform="translate(${CENTER} ${CENTER}) scale(${scale}) translate(${-CENTER} ${-CENTER})"`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" role="img" aria-label="Mieru">`,
    `  <rect width="${SIZE}" height="${SIZE}" fill="${GROUND}"/>`,
    `  <g${transform}>`,
    ...BEAMS.map(([from, to, color]) => `    <path d="${beam(from, to)}" fill="${color}"/>`),
    `    <path d="M 146 372 L 146 146 L 256 296 L 366 146 L 366 372" stroke="${PAPER}" stroke-width="56" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
    "  </g>",
    "</svg>",
    "",
  ].join("\n");
}

/**
 * 書き出す PNG。
 *
 * `any` と `maskable` はファイルを分ける（1つに "any maskable" とまとめない）。
 * maskable は外周10%が切り落とされる前提のため、図案を縮めて余白を確保する。
 */
const OUTPUTS = [
  { file: "icon-192.png", size: 192, scale: 1 },
  { file: "icon-512.png", size: 512, scale: 1 },
  { file: "icon-maskable-512.png", size: 512, scale: 0.82 },
  { file: "apple-touch-icon-180.png", size: 180, scale: 0.9 },
  { file: "favicon-32.png", size: 32, scale: 1 },
  { file: "favicon-16.png", size: 16, scale: 1 },
];

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "icon.svg"), icon(), "utf8");
fs.writeFileSync(path.join(outDir, "icon-maskable.svg"), icon(0.82), "utf8");

const written = [];
for (const { file, size, scale } of OUTPUTS) {
  // density は SVG を読み込むときの解像度。小さく書き出す前に一度大きく描く
  await sharp(Buffer.from(icon(scale)), { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, file));
  written.push(`${file} (${size}px)`);
}

console.log(`生成: icon.svg, icon-maskable.svg, ${written.join(", ")}`);
