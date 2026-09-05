import type { NoteBlock } from "../../core/block.js";
import { parseBlocks } from "../../core/block.js";
import { InlineText } from "./InlineText.js";

/**
 * ノート本文を段落と表として描く（2.10-4）。
 *
 * 何がブロックかの判断は `src/core/block.ts` にあり、ここは描くだけ。
 * 桁の中身にもインライン記法が来るので `InlineText` を通す。
 */

function drawLines(lines: readonly string[]): React.JSX.Element[] {
  // 空行を挟まない改行は書いたとおりに折り返す
  return lines.map((line, at) => (
    <span key={String(at)} className="note-line">
      <InlineText text={line} />
    </span>
  ));
}

function drawBlock(block: NoteBlock, key: string): React.JSX.Element {
  if (block.kind === "paragraph") {
    return (
      <p key={key} className="note-paragraph">
        {drawLines(block.lines)}
      </p>
    );
  }

  if (block.kind === "quote") {
    return (
      <blockquote key={key} className="note-quote">
        {drawLines(block.lines)}
      </blockquote>
    );
  }

  if (block.kind === "code") {
    return (
      // **コードは記法として解釈しない。** `<pre>` にそのまま流す。
      // 長い行は欄からはみ出すので、コードだけを横に送れるようにする（規約 UI）
      <pre
        key={key}
        className="note-code"
        {...(block.lang === undefined ? {} : { "data-lang": block.lang })}
      >
        <code>{block.text}</code>
      </pre>
    );
  }

  return (
    // 桁が多い表は欄からはみ出す。**表だけを横に送れるようにする**（規約 UI）
    <div key={key} className="note-table-wrap">
      <table className="note-table">
        <thead>
          <tr>
            {block.header.map((cell, at) => (
              <th key={String(at)} style={{ textAlign: block.align[at] ?? "left" }}>
                <InlineText text={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowAt) => (
            <tr key={String(rowAt)}>
              {row.map((cell, at) => (
                <td key={String(at)} style={{ textAlign: block.align[at] ?? "left" }}>
                  <InlineText text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NoteBlocks({ text }: { text: string }): React.JSX.Element {
  return <>{parseBlocks(text).map((block, at) => drawBlock(block, String(at)))}</>;
}
