import { serializeMarkdown } from "../../core/serialize.js";
import { useEditor } from "../../state/editor.js";

/**
 * Markdown 表示（2.8-1、設計書 F-25）。
 *
 * **`.md` が唯一の真実であることを、利用者が自分の目で確かめるための画面である**（原則1）。
 * これまで中身を見る手段はテキスト出力しか無く、そちらは `serializeBody()` を通すため
 * **frontmatter を出さない**（原則2により意図的にそうしている）。
 * つまり `mm:` に何が書かれているかを見る手段が1つも無かった。
 *
 * 出すのは保存されるバイト列そのものである。`serializeMarkdown()` は
 * 自動保存が呼ぶのと同じ関数で（`state/autosave.ts`）、出力用に書き直すと
 * 「保存した `.md` と見せた `.md` が違う」という最も気づきにくい食い違いが起きる。
 *
 * **書き換えの入口は持たない。** 読むだけの画面であることは `view-mode.ts` の
 * `isEditableMode` が持ち、ノート欄と編集バーの出し分けもそれで決まる（`layout.ts`）。
 */

/** 保存される大きさ。UTF-8 のバイト数で示す。Markdown は文字数ではなくバイトで保存される */
function byteLength(md: string): number {
  return new TextEncoder().encode(md).length;
}

/** 行数。末尾の改行を1行と数えない */
function lineCount(md: string): number {
  if (md === "") return 0;
  return md.replace(/\n$/, "").split("\n").length;
}

export function Source(): React.JSX.Element {
  /*
   * 保存されるのと同じ手順で毎回作り直す。木が変わるたびに走るが、
   * これは自動保存が走るたびにしている計算と同じ規模である。
   * 結果は文字列なので、内容が変わらない限り再描画は起きない。
   */
  const md = useEditor((state) => {
    const doc = state.buildDoc();
    return doc === null ? "" : serializeMarkdown(doc);
  });

  return (
    <div className="source">
      <pre className="source-body" tabIndex={0} aria-label="保存される Markdown">
        {md}
      </pre>
      <p className="source-size">
        {lineCount(md)} 行 / {byteLength(md)} byte
      </p>
    </div>
  );
}
