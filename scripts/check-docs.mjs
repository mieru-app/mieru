/**
 * ドキュメントの機械的な検査（2026-09-05 追加）。
 *
 * **人が見張る項目を減らすために置いている。** 刷新前は
 * 「現在地が3つの文書で食い違う」「移動した文書へのリンクが切れている」が
 * 誰にも気づかれないまま残っていた。
 *
 * 見るのは2つだけ。
 *
 * - **相対リンクが実在するか。** 文書を移動したときに必ず壊れる
 * - **正本が1つか。** 現在地（Phase の完了宣言）を書いてよいのは
 *   `docs/human-review/roadmap.md` だけである（`.steering/documentation.md`）
 *
 * 決まりそのものは `.steering/documentation.md` にある。ここはその執行。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SKIP = new Set(["node_modules", ".git", "dist", "coverage", "public"]);

/** 検査対象の Markdown を集める */
function collect(dir, found = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, found);
    else if (name.endsWith(".md")) found.push(full);
  }
  return found;
}

/** ```〜``` の中はリンクではない。行単位で落とす */
function withoutFences(text) {
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      if (line.trimStart().startsWith("```")) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
}

const problems = [];

// --- 1. 相対リンクが実在するか -------------------------------------------
const LINK = /\[[^\]]*\]\(([^)]+)\)/g;

for (const file of collect(ROOT)) {
  const body = withoutFences(readFileSync(file, "utf8"));
  for (const [, href] of body.matchAll(LINK)) {
    // 外部リンクとページ内アンカーは対象外
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) continue;
    const target = resolve(dirname(file), href.split("#")[0]);
    try {
      statSync(target);
    } catch {
      problems.push(`${relative(ROOT, file)}: リンク切れ → ${href}`);
    }
  }
}

// --- 2. 現在地の正本が1つか ----------------------------------------------
/**
 * 「Phase 2.10 は完了した」の類。**書いてよいのはロードマップだけ。**
 *
 * 「Phase 2 完了時に評価」「Phase 3 完了条件」は状態の宣言ではないので通す。
 * 弾きたいのは**済んだと言い切っている文**である。
 * `docs/ideas/` は記録なので対象外（書かれた時点の事実である）。
 */
const STATUS = /Phase\s*[0-9.]+[^\n]{0,24}?(完了した|完了している|完了済|到達した|到達済)/;
const OWNER = join("docs", "human-review", "roadmap.md");

for (const file of collect(ROOT)) {
  const rel = relative(ROOT, file);
  if (rel === OWNER) continue;
  if (rel.startsWith(`docs${sep}ideas${sep}`)) continue;
  const body = withoutFences(readFileSync(file, "utf8"));
  for (const [at, line] of body.split("\n").entries()) {
    if (STATUS.test(line)) {
      problems.push(`${rel}:${at + 1}: 現在地は ${OWNER} だけに書く → ${line.trim().slice(0, 60)}`);
    }
  }
}

if (problems.length > 0) {
  console.error("ドキュメントの検査で問題が見つかりました。\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\n合計 ${problems.length} 件。決まりは .steering/documentation.md。`);
  process.exit(1);
}

console.log("ドキュメントの検査: 問題なし");
