/**
 * Markdown のエスケープ処理。
 *
 * ラベル・ノートは元ソースを逐語的に切り出して保持するため（docs/design.md 6.3）、
 * 出力時のエスケープと解析時のアンエスケープが厳密に対になっていないと
 * 往復でバイト列が変わってしまう。この対称性が冪等性の前提であり、
 * 片方だけを変更してはいけない。
 */

/** CommonMark がエスケープ可能とする ASCII 記号 */
const ESCAPABLE = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;

/**
 * `\` + ASCII 記号 のエスケープを解除する。
 * 元ソースをそのまま切り出しているため、この処理を挟まないと
 * 利用者から見たラベルにバックスラッシュが残る。
 */
export function unescapeMarkdown(text: string): string {
  return text.replace(ESCAPABLE, "$1");
}

/**
 * 行頭に置くとブロック要素として解釈される文字をエスケープする。
 *
 * 過剰にエスケープしても冪等性は保たれる（アンエスケープで必ず元に戻るため）。
 * 取りこぼしのほうが危険なので、判定は広めに取っている。
 */
function escapeLineStart(line: string): string {
  // 見出し
  if (/^#{1,6}([ \t]|$)/.test(line)) return `\\${line}`;
  // 箇条書き
  if (/^[-*+]([ \t]|$)/.test(line)) return `\\${line}`;
  // 引用
  if (line.startsWith(">")) return `\\${line}`;
  // コードフェンス
  if (/^(`{3,}|~{3,})/.test(line)) return `\\${line}`;
  // 水平線（3文字以上だが判定は緩めに取る）と setext 見出しの下線。
  // `=` は1文字でも直前の段落を見出しに変えてしまうため 1 個から対象にする
  if (/^([-*_]{2,}|=+)[ \t]*$/.test(line)) return `\\${line}`;
  // HTML ブロック。エスケープしないと段落ではなく html ノードになり破棄される
  if (/^<[!/?a-zA-Z]/.test(line)) return `\\${line}`;
  // リンク参照定義 `[foo]: /url`。`[[横断リンク]]` は該当しないので余計な記号は付かない
  if (/^\[[^\]\n]*\]:/.test(line)) return `\\${line}`;
  // 番号付き箇条書き
  const ordered = /^(\d{1,9})[.)]([ \t]|$)/.exec(line);
  if (ordered?.[1] !== undefined) {
    return `${ordered[1]}\\${line.slice(ordered[1].length)}`;
  }
  return line;
}

/**
 * テキストを Markdown の1行として安全に出力できる形にする。
 *
 * IMPORTANT: バックスラッシュのエスケープを先に行うこと。
 * 順序を逆にすると、行頭エスケープで足した `\` まで二重化されてしまう。
 */
export function escapeInlineText(text: string): string {
  return escapeLineStart(text.replace(/\\/g, "\\\\"));
}

/**
 * ATX 見出しの本文として安全にする。
 *
 * `# 見出し #` の末尾の `#` は「閉じシーケンス」として除去される。
 * そのままではラベル `! #` が `!` に変わってしまうため、
 * 空白に続く末尾の `#` の直前にエスケープを入れて無効化する。
 *
 * 引数は escapeInlineText 済みの文字列であること。
 * ここで足す `\` は読み込み時のアンエスケープで元に戻る。
 */
export function guardHeadingClose(escapedLine: string): string {
  return escapedLine.replace(/([ \t])(#+)([ \t]*)$/, "$1\\$2$3");
}
