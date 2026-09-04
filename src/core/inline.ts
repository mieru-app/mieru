import type { Node, PhrasingContent } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";

/**
 * インライン記法の表示（Phase 2.10-1）。
 *
 * **保存形式には触れない。** ラベルとノートは記法を含む生の文字列として
 * モデルに入っており（設計書 6.3）、ここはそれを「見える形」に変換するだけである。
 * 編集を始めれば `mind-elixir` が生の文字列を入力欄へ入れるので記号は戻る。
 *
 * **必ず許可リスト方式で書く。** Phase 2.6 以降、開くのは自分が書いた `.md` とは
 * 限らない。実測では `[危険](javascript:alert(1))` の href がそのまま残り、
 * `<b>bold</b>` は html ノードとして届く。素朴に組み立てると、そこが実行経路になる。
 * **出してよいものだけを列挙し、それ以外は文字として逃がす。**
 *
 * `remark-gfm` は入れない（`CLAUDE.md`）。禁止の理由は**解析**が変わって表が
 * 破棄されるようになることであり、表示を自前で行うのは禁止に触れない。
 * したがって `~~打ち消し~~` は自前で扱う（`remark-parse` は text のまま返す）。
 */

const processor = unified().use(remarkParse);

/** 表示してよい要素。この一覧に無いものは文字として出す */
export type InlineToken =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "strong"; children: InlineToken[] }
  | { kind: "em"; children: InlineToken[] }
  | { kind: "del"; children: InlineToken[] }
  | { kind: "link"; href: string; children: InlineToken[] };

/** 開いてよいスキーム。相対パスはこのアプリでは意味を持たないので許さない */
const SAFE_SCHEMES = ["http:", "https:", "mailto:"];

/** スキームらしき先頭部分 */
const SCHEME = /^[a-z][a-z0-9+.-]*:/;

/**
 * 開いてよい URL なら整えて返し、そうでなければ null を返す。
 *
 * **空白と制御文字を先に落とす。** `java\tscript:` のように途中へ挟むと
 * 素朴な前方一致は擦り抜けるが、ブラウザは詰めて解釈する。
 */
export function safeHref(raw: string): string | null {
  // eslint-disable-next-line no-control-regex -- 制御文字の除去そのものが目的
  const cleaned = raw.replace(/[\u0000-\u0020\u007f]/g, "");
  if (cleaned === "") return null;

  // 同じ文書の中の位置指定。外へ出ないので許す
  if (cleaned.startsWith("#")) return cleaned;

  const scheme = SCHEME.exec(cleaned.toLowerCase());
  // スキームが無いものは相対パス。開く先が定まらないので許さない
  if (scheme === null) return null;
  return SAFE_SCHEMES.includes(scheme[0]) ? cleaned : null;
}

/** 元の文字列から、そのノードが占めていた範囲をそのまま切り出す */
function rawOf(source: string, node: Node): string {
  const from = node.position?.start.offset;
  const to = node.position?.end.offset;
  if (from === undefined || to === undefined) return "";
  return source.slice(from, to);
}

/** 打ち消し。`remark-parse` は解釈しないので自前で切る */
const STRIKE = /~~([^~]+)~~/g;

/**
 * text ノードの中の `~~...~~` を取り出す。
 * 対になっていない `~~` は文字として残す。
 */
function splitStrike(value: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let at = 0;
  for (const match of value.matchAll(STRIKE)) {
    const start = match.index;
    if (start > at) tokens.push({ kind: "text", value: value.slice(at, start) });
    tokens.push({ kind: "del", children: [{ kind: "text", value: match[1] ?? "" }] });
    at = start + match[0].length;
  }
  if (at < value.length) tokens.push({ kind: "text", value: value.slice(at) });
  return tokens;
}

function convert(source: string, nodes: readonly PhrasingContent[]): InlineToken[] {
  const tokens: InlineToken[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case "text":
        tokens.push(...splitStrike(node.value));
        break;
      case "inlineCode":
        // コードの中身は記法として解釈しない。書いたとおりに出す
        tokens.push({ kind: "code", value: node.value });
        break;
      case "strong":
        tokens.push({ kind: "strong", children: convert(source, node.children) });
        break;
      case "emphasis":
        tokens.push({ kind: "em", children: convert(source, node.children) });
        break;
      case "delete":
        // `remark-gfm` を入れれば来るが、いまは来ない。将来入っても壊れないようにする
        tokens.push({ kind: "del", children: convert(source, node.children) });
        break;
      case "link": {
        const href = safeHref(node.url);
        const children = convert(source, node.children);
        // 開けない URL はリンクにしない。**書いた文字はそのまま見せる**ので、
        // 何が書いてあったかは利用者に伝わる
        tokens.push(
          href === null
            ? { kind: "text", value: rawOf(source, node) }
            : { kind: "link", href, children },
        );
        break;
      }
      case "break":
        tokens.push({ kind: "text", value: "\n" });
        break;
      default:
        // 許可リストの外。画像・HTML・脚注などは書いたままの文字として出す
        tokens.push(...splitStrike(rawOf(source, node)));
        break;
    }
  }
  return tokens;
}

/**
 * 1行ぶんの文字列を表示用の並びに変える。
 *
 * **段落1つに収まらない入力は、まるごと文字として返す。** ラベルに `# 見出し` や
 * `- 項目` と書かれていたときに、見出しや箇条書きとして描いてしまわないようにする。
 */
export function parseInline(text: string): InlineToken[] {
  if (text === "") return [];

  const root = processor.parse(text);
  const only = root.children.length === 1 ? root.children[0] : undefined;
  if (only === undefined || only.type !== "paragraph") return [{ kind: "text", value: text }];

  return convert(text, only.children);
}

/** HTML として出してはいけない文字を実体参照へ逃がす */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TAGS: Record<"strong" | "em" | "del", string> = {
  strong: "strong",
  em: "em",
  del: "del",
};

function toHtml(tokens: readonly InlineToken[]): string {
  let html = "";
  for (const token of tokens) {
    switch (token.kind) {
      case "text":
        html += escapeHtml(token.value);
        break;
      case "code":
        html += `<code>${escapeHtml(token.value)}</code>`;
        break;
      case "link":
        // **外部サイトへ元の頁を触らせない。** `noopener` が無いと
        // 開いた先から `window.opener` 経由でこちらを操作できる
        html += `<a href="${escapeHtml(token.href)}" target="_blank" rel="noopener noreferrer">${toHtml(token.children)}</a>`;
        break;
      default:
        html += `<${TAGS[token.kind]}>${toHtml(token.children)}</${TAGS[token.kind]}>`;
        break;
    }
  }
  return html;
}

/**
 * 1行ぶんの文字列を HTML にする。`mind-elixir` のように
 * HTML 文字列しか受け取れない相手のために用意する。
 *
 * **React の表示では `parseInline` を使い、要素として組み立てること。**
 * HTML 文字列を渡す口を増やすほど、逃がし忘れが混ざる余地が増える。
 */
export function renderInlineHtml(text: string): string {
  return toHtml(parseInline(text));
}

/** 記法を取り除いた見た目の文字列。検索や読み上げの当て先に使う */
export function inlineToPlainText(text: string): string {
  const walk = (tokens: readonly InlineToken[]): string =>
    tokens
      .map((token) =>
        token.kind === "text" || token.kind === "code" ? token.value : walk(token.children),
      )
      .join("");
  return walk(parseInline(text));
}
