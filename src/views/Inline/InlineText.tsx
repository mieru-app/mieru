import type { InlineToken } from "../../core/inline.js";
import { parseInline } from "../../core/inline.js";

/**
 * インライン記法を要素として描く（2.10-3）。
 *
 * **HTML 文字列を渡さない。** `renderInlineHtml()` は `mind-elixir` のように
 * 文字列しか受け取れない相手のためにあり、React 側はトークン列から組み立てる。
 * `dangerouslySetInnerHTML` の口を増やすほど、逃がし忘れが混ざる余地が増える。
 *
 * どの記法を出してよいかの判断は `src/core/inline.ts` にある。ここは描くだけ。
 */

function draw(tokens: readonly InlineToken[]): React.ReactNode[] {
  return tokens.map((token, index) => {
    // 並びは入力から一意に決まり、途中で入れ替わらない。添字を鍵にしてよい
    const key = String(index);
    switch (token.kind) {
      case "text":
        return <span key={key}>{token.value}</span>;
      case "code":
        return <code key={key}>{token.value}</code>;
      case "strong":
        return <strong key={key}>{draw(token.children)}</strong>;
      case "em":
        return <em key={key}>{draw(token.children)}</em>;
      case "del":
        return <del key={key}>{draw(token.children)}</del>;
      case "link":
        return (
          // 開いた先から window.opener 経由でこちらを操作させない
          <a key={key} href={token.href} target="_blank" rel="noopener noreferrer">
            {draw(token.children)}
          </a>
        );
    }
  });
}

export function InlineText({ text }: { text: string }): React.JSX.Element {
  return <>{draw(parseInline(text))}</>;
}
