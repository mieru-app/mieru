import type { NoteBlock } from "../../core/block.js";
import { parseBlocks } from "../../core/block.js";
import { InlineText } from "./InlineText.js";

/**
 * ノート本文を段落と表として描く（2.10-4）。
 *
 * 何がブロックかの判断は `src/core/block.ts` にあり、ここは描くだけ。
 * 桁の中身にもインライン記法が来るので `InlineText` を通す。
 */

function drawBlock(block: NoteBlock, key: string): React.JSX.Element {
  if (block.kind === "paragraph") {
    return (
      <p key={key} className="note-paragraph">
        {block.lines.map((line, at) => (
          // 空行を挟まない改行は書いたとおりに折り返す
          <span key={String(at)} className="note-line">
            <InlineText text={line} />
          </span>
        ))}
      </p>
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
