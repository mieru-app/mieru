/**
 * アイコン候補と選定用ページの生成。
 *
 *   node assets/icon/generate.mjs
 *
 * 方針: 文字マーク「M」を、中心から放射する枝に見立てて色分けする。
 * グラデーションは使わない。高彩度の単色を面で塗り分け、隣り合う色は色相を
 * 大きく離し、地とのあいだに明度差を作る（「モヤっとさせずパキッと」）。
 *
 * 出力:
 *   candidate-{a,b,c}.svg  … 候補そのもの
 *   preview.html           … ブラウザで開いて比較するためのページ
 *   preview.fragment.html  … 同じ内容を Artifact 用に切り出したもの
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** 枝の配色。明度と彩度を揃え、色相だけを大きく離してある */
const PALETTE = {
  blue: "#2E8BFF",
  green: "#12D18E",
  amber: "#FFB020",
  red: "#FF3B5C",
  violet: "#A855F7",
};
const INK = "#0E1116";
const PAPER = "#FFFFFF";

const SIZE = 512;

function wrap(body, background) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" role="img" aria-label="Mieru">`,
    `  <rect width="${SIZE}" height="${SIZE}" fill="${background}"/>`,
    body,
    "</svg>",
  ].join("\n");
}

/**
 * 案A「枝の M」
 * M の4本のストロークを、中心から伸びる枝として1本ずつ色を変える。
 * 折れ点に節を置き、マインドマップであることを明示する。
 */
function candidateA() {
  const w = 34;
  const cap = 'stroke-linecap="round" stroke-linejoin="round" fill="none"';
  return wrap(
    [
      `  <path d="M 150 366 L 150 146" stroke="${PALETTE.blue}" stroke-width="${w}" ${cap}/>`,
      `  <path d="M 150 146 L 256 292" stroke="${PALETTE.green}" stroke-width="${w}" ${cap}/>`,
      `  <path d="M 256 292 L 362 146" stroke="${PALETTE.amber}" stroke-width="${w}" ${cap}/>`,
      `  <path d="M 362 146 L 362 366" stroke="${PALETTE.red}" stroke-width="${w}" ${cap}/>`,
      `  <circle cx="150" cy="146" r="27" fill="${PALETTE.blue}"/>`,
      `  <circle cx="362" cy="146" r="27" fill="${PALETTE.red}"/>`,
      `  <circle cx="256" cy="292" r="31" fill="${PAPER}"/>`,
    ].join("\n"),
    INK,
  );
}

/**
 * 案B「面で切った M」
 * M を4枚の多角形に割り、隣り合う面を別色で塗る。線ではなく面なので
 * 小さくしても色が痩せない。3案でいちばん強い。
 */
function candidateB() {
  return wrap(
    [
      `  <path d="M 132 372 L 132 140 L 196 140 L 196 372 Z" fill="${PALETTE.blue}"/>`,
      `  <path d="M 132 140 L 196 140 L 288 268 L 256 316 Z" fill="${PALETTE.green}"/>`,
      `  <path d="M 380 140 L 316 140 L 224 268 L 256 316 Z" fill="${PALETTE.amber}"/>`,
      `  <path d="M 380 372 L 380 140 L 316 140 L 316 372 Z" fill="${PALETTE.red}"/>`,
    ].join("\n"),
    INK,
  );
}

/**
 * 案C「白地の M、色は節点」
 * 明るい地に濃い M を置き、枝の先端の節だけを彩色する。
 * 色数を絞るぶん字形が最も読みやすい。
 */
function candidateC() {
  const w = 40;
  return wrap(
    [
      `  <path d="M 148 368 L 148 148 L 256 296 L 364 148 L 364 368" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
      `  <circle cx="148" cy="148" r="30" fill="${PALETTE.blue}"/>`,
      `  <circle cx="364" cy="148" r="30" fill="${PALETTE.red}"/>`,
      `  <circle cx="256" cy="296" r="26" fill="${PALETTE.amber}"/>`,
      `  <circle cx="148" cy="368" r="22" fill="${PALETTE.green}"/>`,
      `  <circle cx="364" cy="368" r="22" fill="${PALETTE.violet}"/>`,
    ].join("\n"),
    PAPER,
  );
}

const CANDIDATES = [
  {
    key: "a",
    name: "枝の M",
    svg: candidateA(),
    idea: "M の4本を1本ずつ別の色の枝として描き、折れ点に節を置く。マインドマップであることが最も伝わる。",
    watch: "線が細いぶん、16px では色の並びが潰れて読みにくくなる可能性がある。",
  },
  {
    key: "b",
    name: "面で切った M",
    svg: candidateB(),
    idea: "M を4枚の面に割って塗り分ける。線ではなく面なので小さくしても色が痩せない。",
    watch: "枝のニュアンスは消え、記号として抽象度が上がる。",
  },
  {
    key: "c",
    name: "白地の M・色は節点",
    svg: candidateC(),
    idea: "明るい地に濃い M。色は枝の先端の節だけに置く。字形がいちばん読みやすい。",
    watch: "白地なので、明るい壁紙のタスクバーでは輪郭が溶けやすい。",
  },
];

const SMALL_SIZES = [16, 24, 32, 48, 64];

const css = `
:root {
  color-scheme: light;
  --ink: #12151a;
  --paper: #fbfcfd;
  --surface: #ffffff;
  --sunken: #eef2f6;
  --line: #dde4ec;
  --muted: #5f6b7a;
  --accent: #2e8bff;

  /* アイコンを載せる地。判定のための素材なので、ページのテーマでは変えない */
  --ground-light: #ffffff;
  --ground-dark: #0e1116;

  --step-0: 0.9375rem;
  --step-1: 1.0625rem;
  --step-2: 1.375rem;
  --step-3: 2rem;
  --step-4: 2.75rem;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --ink: #e8ecf2;
    --paper: #101318;
    --surface: #171b22;
    --sunken: #1e232c;
    --line: #2a313b;
    --muted: #9aa5b4;
    --accent: #6ba8ff;
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --ink: #e8ecf2;
  --paper: #101318;
  --surface: #171b22;
  --sunken: #1e232c;
  --line: #2a313b;
  --muted: #9aa5b4;
  --accent: #6ba8ff;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: "Noto Sans JP", "Yu Gothic UI", system-ui, sans-serif;
  font-size: var(--step-0);
  line-height: 1.75;
}

.page {
  max-width: 68rem;
  margin: 0 auto;
  padding: clamp(2rem, 5vw, 4rem) clamp(1rem, 4vw, 2.5rem) 6rem;
  display: flex;
  flex-direction: column;
  gap: 3.5rem;
}

h1, h2, h3 {
  font-family: "Zen Kaku Gothic New", "Noto Sans JP", sans-serif;
  text-wrap: balance;
  margin: 0;
}

h1 { font-size: var(--step-4); font-weight: 700; letter-spacing: -0.01em; }
h2 { font-size: var(--step-2); font-weight: 700; }
h3 { font-size: var(--step-1); font-weight: 700; }

p { margin: 0; max-width: 62ch; }

.eyebrow {
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-size: 0.75rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
}

.lede { color: var(--muted); font-size: var(--step-1); }

header.head { display: flex; flex-direction: column; gap: 0.6rem; }

section { display: flex; flex-direction: column; gap: 1.25rem; }

.section-head { display: flex; flex-direction: column; gap: 0.35rem; }

.note { color: var(--muted); }

/* ── 小サイズ比較 ─────────────────────────────── */

.scale-wrap { overflow-x: auto; }

.scale {
  border-collapse: collapse;
  width: 100%;
  min-width: 40rem;
}

.scale th, .scale td {
  border-bottom: 1px solid var(--line);
  padding: 0.9rem 0.75rem;
  text-align: center;
  vertical-align: middle;
}

.scale th {
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.scale th:first-child, .scale td:first-child {
  text-align: left;
  white-space: nowrap;
  font-family: "Zen Kaku Gothic New", sans-serif;
  font-weight: 700;
}

.scale tbody tr:last-child td { border-bottom: none; }

.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  border-radius: 8px;
}

.chip.on-light { background: var(--ground-light); }
.chip.on-dark { background: var(--ground-dark); }

.chip svg { display: block; border-radius: 2px; }

.ground-label {
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  color: var(--muted);
}

/* ── 候補ごと ─────────────────────────────────── */

.candidate {
  display: grid;
  grid-template-columns: minmax(0, 15rem) minmax(0, 1fr);
  gap: clamp(1.25rem, 4vw, 2.5rem);
  align-items: start;
  padding: clamp(1.25rem, 3vw, 2rem);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}

@media (max-width: 46rem) {
  .candidate { grid-template-columns: minmax(0, 1fr); }
}

.hero svg { display: block; width: 100%; height: auto; border-radius: 20%; }

.candidate-body { display: flex; flex-direction: column; gap: 1.1rem; min-width: 0; }

.candidate-title { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; }

.key {
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
}

.crops { display: flex; flex-wrap: wrap; gap: 1.1rem; }

.crop { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }

.crop svg { display: block; width: 84px; height: 84px; }

.crop-circle svg { border-radius: 50%; }
.crop-squircle svg { border-radius: 28%; }
.crop-square svg { border-radius: 6%; }

.crop-label {
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-size: 0.7rem;
  color: var(--muted);
}

.taskbar {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  background: var(--ground-dark);
  border-radius: 10px;
  padding: 0.6rem 0.9rem;
}

.taskbar svg { width: 32px; height: 32px; border-radius: 20%; display: block; }

.taskbar .placeholder {
  width: 32px;
  height: 32px;
  border-radius: 20%;
  background: #2b323d;
}

.watch { color: var(--muted); }
.watch strong { color: var(--ink); font-weight: 700; }

/* ── パレット ─────────────────────────────────── */

.swatches { display: flex; flex-wrap: wrap; gap: 0.75rem; }

.swatch {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.8rem 0.45rem 0.45rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
}

.swatch i {
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  display: block;
}

.swatch code {
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

/* ── 判断の手引き ─────────────────────────────── */

.checks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.checks li {
  background: var(--sunken);
  border-radius: 10px;
  padding: 1rem 1.15rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.checks b { font-family: "Zen Kaku Gothic New", sans-serif; }
.checks span { color: var(--muted); font-size: 0.875rem; line-height: 1.6; }

footer {
  border-top: 1px solid var(--line);
  padding-top: 1.5rem;
  color: var(--muted);
  font-size: 0.875rem;
}

a { color: var(--accent); }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
`;

/** SVG を指定の大きさで描くための属性差し替え */
function sized(svg, px) {
  return svg.replace(/width="\d+" height="\d+"/, `width="${px}" height="${px}"`);
}

function scaleTable(ground) {
  const rows = CANDIDATES.map((candidate) => {
    const cells = SMALL_SIZES.map(
      (px) => `        <td><span class="chip on-${ground}">${sized(candidate.svg, px)}</span></td>`,
    ).join("\n");
    return `      <tr>\n        <td>${candidate.name}</td>\n${cells}\n      </tr>`;
  }).join("\n");

  const headers = SMALL_SIZES.map((px) => `<th scope="col">${px}px</th>`).join("");
  return [
    '  <div class="scale-wrap">',
    `    <p class="ground-label">${ground === "light" ? "明るい地" : "暗い地"}</p>`,
    '    <table class="scale">',
    `      <thead><tr><th scope="col">候補</th>${headers}</tr></thead>`,
    "      <tbody>",
    rows,
    "      </tbody>",
    "    </table>",
    "  </div>",
  ].join("\n");
}

function candidateSection(candidate) {
  const crops = [
    ["crop-circle", "円（Android）"],
    ["crop-squircle", "角丸（iOS / Win）"],
    ["crop-square", "ほぼ正方"],
  ]
    .map(
      ([cls, label]) =>
        `        <div class="crop ${cls}">${sized(candidate.svg, 84)}<span class="crop-label">${label}</span></div>`,
    )
    .join("\n");

  return [
    '  <article class="candidate">',
    `    <div class="hero">${sized(candidate.svg, 512)}</div>`,
    '    <div class="candidate-body">',
    '      <div class="candidate-title">',
    `        <h3>${candidate.name}</h3><span class="key">案 ${candidate.key.toUpperCase()}</span>`,
    "      </div>",
    `      <p>${candidate.idea}</p>`,
    '      <div class="crops">',
    crops,
    "      </div>",
    '      <div class="taskbar">',
    '        <span class="placeholder"></span>',
    `        ${sized(candidate.svg, 32)}`,
    '        <span class="placeholder"></span>',
    '        <span class="placeholder"></span>',
    "      </div>",
    `      <p class="watch"><strong>注意点:</strong> ${candidate.watch}</p>`,
    "    </div>",
    "  </article>",
  ].join("\n");
}

const swatches = Object.entries(PALETTE)
  .map(
    ([name, hex]) =>
      `    <span class="swatch"><i style="background:${hex}"></i><b>${name}</b><code>${hex}</code></span>`,
  )
  .join("\n");

const body = [
  '<div class="page">',
  '  <header class="head">',
  '    <span class="eyebrow">Mieru / icon</span>',
  "    <h1>アイコン候補</h1>",
  '    <p class="lede">文字マーク「M」を枝に見立てた3案。グラデーションは使わず、高彩度の単色を面で塗り分けています。判断が分かれるのは大きく描いたときではなく、16px と切り抜き後です。そこから先に見てください。</p>',
  "  </header>",
  "",
  "  <section>",
  '    <div class="section-head">',
  "      <h2>実サイズでの見え方</h2>",
  '      <p class="note">タスクバーは 16〜32px、アプリ一覧で 48px 前後。ここで色が濁ったり字形が潰れる案は、どれだけ大きく美しくても使えません。</p>',
  "    </div>",
  scaleTable("light"),
  scaleTable("dark"),
  "  </section>",
  "",
  "  <section>",
  '    <div class="section-head">',
  "      <h2>候補</h2>",
  '      <p class="note">切り抜きは OS ごとに形が変わります。外周10%は削られる前提で、要素は中央80%（512px 換算で 409px）に収めてあります。</p>',
  "    </div>",
  ...CANDIDATES.map(candidateSection),
  "  </section>",
  "",
  "  <section>",
  '    <div class="section-head">',
  "      <h2>配色</h2>",
  '      <p class="note">アプリのブランチ自動配色（設計書 F-24）と同じ色を使います。アイコンと画面の色が揃っていると、道具としての一体感が出ます。彩度と明度を揃え、色相だけを離してあるので、隣り合っても濁りません。</p>',
  "    </div>",
  '    <div class="swatches">',
  swatches,
  "    </div>",
  "  </section>",
  "",
  "  <section>",
  '    <div class="section-head">',
  "      <h2>見るべき点</h2>",
  "    </div>",
  '    <ul class="checks">',
  "      <li><b>16px で読めるか</b><span>タスクバーとブラウザのタブがこの大きさ。ここで潰れたら他が良くても不採用。</span></li>",
  "      <li><b>暗い地と明るい地の両方で立つか</b><span>Windows の壁紙とテーマで背景が変わります。片方でしか成立しない案は避ける。</span></li>",
  "      <li><b>円に切られても成立するか</b><span>Android は円に切り抜きます。四隅に意味を持たせた案は崩れます。</span></li>",
  "      <li><b>他のアイコンの隣で見分けられるか</b><span>タスクバーには10個以上並びます。形の輪郭が独自かどうか。</span></li>",
  "    </ul>",
  "  </section>",
  "",
  "  <footer>",
  "    <p>生成: <code>node assets/icon/generate.mjs</code> ／ 色や形を変えたら同じコマンドでこのページも作り直されます。</p>",
  "  </footer>",
  "</div>",
].join("\n");

const head = [
  "<title>Mieru アイコン候補</title>",
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@700&family=Noto+Sans+JP:wght@400;700&family=IBM+Plex+Mono:wght@400;500&display=swap">',
  `<style>${css}</style>`,
].join("\n");

// Artifact 用（ページ本体のみ。骨組みは公開時に付く）
fs.writeFileSync(path.join(here, "preview.fragment.html"), `${head}\n${body}\n`, "utf8");

// ローカルでそのまま開ける完全な文書
const standalone = [
  "<!doctype html>",
  '<html lang="ja">',
  "<head>",
  '<meta charset="UTF-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  head,
  "</head>",
  "<body>",
  body,
  "</body>",
  "</html>",
  "",
].join("\n");
fs.writeFileSync(path.join(here, "preview.html"), standalone, "utf8");

for (const candidate of CANDIDATES) {
  fs.writeFileSync(path.join(here, `candidate-${candidate.key}.svg`), `${candidate.svg}\n`, "utf8");
}

console.log(`生成: ${CANDIDATES.map((c) => `candidate-${c.key}.svg`).join(", ")}, preview.html`);
