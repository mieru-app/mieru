/**
 * Signed-off-by（DCO）の検査。
 *
 * **これは将来の選択肢を安く保つための仕組みである。**
 * ライセンスを変えられるかどうかは、著作権者の数と、その連絡が付くかで決まる。
 * 貢献者が増えてから記録を作ろうとしても、そのときには手遅れになっている。
 * 経緯は `docs/ideas/2026-09-05-license-options.md`。
 *
 * 確かめるのは1つだけ。**Pull Request の各コミットに、作者本人の
 * `Signed-off-by:` が付いているか。** 別人の名前で署名しても通らない。
 * 署名の意味そのものはリポジトリ直下の `DCO` にある。
 *
 * 使い方: `node scripts/check-dco.mjs <base> <head>`
 */

import { execFileSync } from "node:child_process";

/**
 * 署名を求めない相手。
 *
 * **bot は DCO を証明できない。** 人が「自分に権利がある」と述べる仕組みであり、
 * 依存を上げるだけの自動コミットに求めても意味が無い。ここを空けておかないと
 * Dependabot の Pull Request が毎週落ち、**門そのものが無視されるようになる。**
 *
 * 見分け方は GitHub の命名規約に合わせる。bot の作者名は必ず `[bot]` で終わり、
 * メールアドレスにも同じ綴りが入る。**人が `[bot]` を名乗る余地はある**が、
 * それは署名を偽るのと同じことであり、機械で防ぐ話ではない。
 */
function isBot(name, email) {
  return name.endsWith("[bot]") || email.includes("[bot]@");
}

/** コミットを1件ずつ取り出す。本文に改行が入るので、区切りを自前で置く */
const SEPARATOR = "@@mieru-commit@@";

function commitsBetween(base, head) {
  const out = execFileSync(
    "git",
    ["log", "--format=%H%n%an%n%ae%n%B" + SEPARATOR, base + ".." + head],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );

  return out
    .split(SEPARATOR)
    .map((chunk) => chunk.replace(/^\n+/, ""))
    .filter((chunk) => chunk.trim() !== "")
    .map((chunk) => {
      const [sha = "", name = "", email = "", ...rest] = chunk.split("\n");
      return { sha, name, email, message: rest.join("\n") };
    });
}

/** 本文に、その作者本人の署名があるか */
function signedByAuthor(commit) {
  const wanted = `signed-off-by: ${commit.name} <${commit.email}>`.toLowerCase();
  return commit.message
    .split("\n")
    .some((line) => line.trim().toLowerCase().replace(/\s+/g, " ") === wanted);
}

const [base, head] = process.argv.slice(2);
if (base === undefined || head === undefined) {
  console.error("使い方: node scripts/check-dco.mjs <base> <head>");
  process.exit(2);
}

const commits = commitsBetween(base, head);
const missing = commits.filter(
  (commit) => !isBot(commit.name, commit.email) && !signedByAuthor(commit),
);

if (missing.length > 0) {
  console.error("Signed-off-by が無いコミットがあります。\n");
  for (const commit of missing) {
    const subject = commit.message.split("\n")[0] ?? "";
    console.error(`  ${commit.sha.slice(0, 8)}  ${commit.name} <${commit.email}>  ${subject}`);
  }
  console.error(
    [
      "",
      "署名は「自分にこのコードを出す権利がある」という表明です（リポジトリ直下の DCO）。",
      "",
      "  これから書くとき : git commit -s",
      "  直前の1件を直す   : git commit --amend -s --no-edit",
      `  この Pull Request 全体を直す : git rebase --signoff ${base}`,
      "",
      "**署名は作者本人のものである必要があります。** 他人の分を代わりに付けることはできません。",
      "書き換えたら force push が要ります（自分のブランチなら問題ありません）。",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(`Signed-off-by の検査: ${String(commits.length)} 件すべて問題なし`);
