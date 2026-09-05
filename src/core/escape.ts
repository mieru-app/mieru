/**
 * Markdown のエスケープ処理。
 *
 * ラベル・ノートは元ソースを逐語的に切り出して保持するため
 * （`docs/design/data-format.md` 6.3「インライン記法はそのまま保持し、解釈しない」）、
 * 出力時のエスケープと解析時のアンエスケープが厳密に対になっていないと
 * 往復でバイト列が変わってしまう。この対称性が冪等性の前提であり、
 * 片方だけを変更してはいけない。
 *
 * **IMPORTANT: 足すのは行頭と見出し末尾だけである。**
 * かつては解析側が `\` + ASCII 記号を全て解除していたが、出力側は行頭しか
 * 足していなかったため対になっておらず、**他人が書いた `.md` の `\*` が
 * 強調記号に化けていた**（2026-09-05 に修正）。
 * 足す規則を増やすときは、必ず `unescapeLineStart()` に対の解除を書くこと。
 */

/**
 * 行頭に置くとブロック要素として解釈される文字をエスケープする。
 *
 * 取りこぼすと構造が壊れるので、判定は広めに取っている。
 * 過剰に足しても、`unescapeLineStart()` が必ず元へ戻す。
 *
 * `keepQuote` はノート用。**ノートの中の `>` は引用として逐語で出す**ため、
 * 引用の規則だけを外す（`note.ts`）。ラベルは1行に収める必要があり、
 * `- > q` はラベルが空の項目として解析されてしまうので外せない。
 */
function escapeLineStart(line: string, keepQuote = false): string {
  /*
   * **`\` で始まる行には何も足さない。**
   * その行は Markdown 上ですでにエスケープされており、ブロック要素として
   * 解釈されない。ここで足すと、他人が書いた `\*star\*` が
   * `\\*star\*` に増える（2026-09-05 に実測して外した）。
   *
   * 代償として、モデル上の `\- foo` は読み戻すと `- foo` になる。
   * **どちらもファイル上は同じ `\- foo` であり、バイト列は動かない。**
   * model → md → model ではなく md → model → md を守るのが強保証である。
   */
  // 見出し
  if (/^#{1,6}([ \t]|$)/.test(line)) return `\\${line}`;
  // 箇条書き
  if (/^[-*+]([ \t]|$)/.test(line)) return `\\${line}`;
  // 引用
  if (!keepQuote && line.startsWith(">")) return `\\${line}`;
  // コードフェンス。**対になっている柵はここへ来ない**（`note.ts` が逐語で出す）。
  // 来るのは対の無い柵だけであり、逐語で出すと後続の行を飲み込む
  if (/^(`{3,}|~{3,})/.test(line)) return `\\${line}`;
  // 水平線（3文字以上だが判定は緩めに取る）と setext 見出しの下線。
  // `=` は1文字でも直前の段落を見出しに変えてしまうため 1 個から対象にする
  if (/^([-*_]{2,}|=+)[ \t]*$/.test(line)) return `\\${line}`;
  // HTML ブロック。エスケープしないと段落ではなく html ノードになり破棄される
  if (/^<[!/?a-zA-Z]/.test(line)) return `\\${line}`;
  // リンク参照定義 `[foo]: /url`。`[[横断リンク]]` は該当しないので余計な記号は付かない
  if (/^\[[^\]\n]*\]:/.test(line)) return `\\${line}`;
  /*
   * **定義の見出しは行をまたげる。** `[` で開いて閉じないまま行が終わると、
   * 次の行の `]:` と繋がって定義になり、**枝が丸ごと消える**
   * （ラベル `[` ＋ノート `!]:` で再現。2026-09-05、25万件で発見）。
   * 閉じ括弧が同じ行にあれば定義にならないので、無いときだけ足す
   */
  if (/^\[[^\]]*$/.test(line)) return `\\${line}`;
  // 番号付き箇条書き
  const ordered = /^(\d{1,9})[.)]([ \t]|$)/.exec(line);
  if (ordered?.[1] !== undefined) {
    return `${ordered[1]}\\${line.slice(ordered[1].length)}`;
  }
  return line;
}

/**
 * `escapeLineStart()` が足した `\` だけを取り除く。
 *
 * **判定は「外してからもう一度エスケープすると元に戻るか」で行う。**
 * 位置と条件を二重に書くと、片方を直したときに黙ってずれる。
 * この形なら、`escapeLineStart()` に規則を足しても対が自動的に保たれる。
 *
 * 行の途中の `\*` には触れないので、**利用者が書いた「文字としての星」は
 * そのまま残る。** これが 2026-09-05 に直した本体である。
 */
function unescapeLineStart(line: string, keepQuote = false): string {
  // 番号付き箇条書き。`1\. foo` の `\` は数字の後ろにある
  const ordered = /^(\d{1,9})\\[.)]/.exec(line);
  if (ordered?.[1] !== undefined) {
    const bare = ordered[1] + line.slice(ordered[1].length + 1);
    if (escapeLineStart(bare, keepQuote) === line) return bare;
  }
  if (line.startsWith("\\")) {
    const bare = line.slice(1);
    if (escapeLineStart(bare, keepQuote) === line) return bare;
  }
  return line;
}

/**
 * テキストを Markdown の1行として安全に出力できる形にする。
 *
 * ここで足した `\` は `unescapeInlineText()` が必ず取り除く。
 */
export function escapeInlineText(text: string): string {
  return escapeLineStart(text);
}

/** `escapeInlineText()` の逆。解析側で使う */
export function unescapeInlineText(text: string): string {
  return unescapeLineStart(text);
}

/**
 * ノートの本文行を安全に出力できる形にする。
 *
 * **引用の規則を持たない。** ノートの `>` は引用として逐語で出すため
 * （`note.ts`）、ここで `\` を足すと二重になる。
 * **呼び出しは `note.ts` の `escapeNote()` を通すこと。**
 * 逐語行に掛けてはいけない。
 */
export function escapeNoteLine(text: string): string {
  return escapeLineStart(text, true);
}

/** `escapeNoteLine()` の逆。`note.ts` の `unescapeNote()` から呼ぶ */
export function unescapeNoteLine(text: string): string {
  return unescapeLineStart(text, true);
}

/**
 * ATX 見出しの本文として安全にする。
 *
 * `# 見出し #` の末尾の `#` は「閉じシーケンス」として除去される。
 * そのままではラベル `! #` が `!` に変わってしまうため、
 * 空白に続く末尾の `#` の直前にエスケープを入れて無効化する。
 *
 * 引数は `escapeInlineText()` 済みの文字列であること。
 */
export function guardHeadingClose(escapedLine: string): string {
  // **すでにある `\` の前へ1つ足す。** ラベルが `a \#` のように
  // バックスラッシュを含む場合、単に1つ足すだけだと `a #` と出力が衝突し、
  // 読み戻したときにどちらだったか決められなくなる（本数で区別する）
  return escapedLine.replace(/([ \t])(\\*)(#+)([ \t]*)$/, "$1\\$2$3$4");
}

/** `guardHeadingClose()` の逆。見出し行の解析で使う */
export function unguardHeadingClose(line: string): string {
  // 本数を1つ減らし、「足し直すと元に戻るか」で確かめる
  const bare = line.replace(/([ \t])\\(\\*#+[ \t]*)$/, "$1$2");
  return guardHeadingClose(bare) === line ? bare : line;
}
