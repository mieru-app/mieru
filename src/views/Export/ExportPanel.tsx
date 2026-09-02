import type { ExportMode } from "../../core/export.js";

/**
 * AI 出力パネル（F-33 / F-35）。
 *
 * 3つのモードの違いは説明より現物を見た方が早いので、選ぶとその場で結果を出す。
 * 何が渡るのか分からないまま貼り付けるのが、この道具でいちばん困る状況である。
 *
 * 仕様の正本: docs/design.md 7.3
 */

interface ModeChoice {
  mode: ExportMode;
  label: string;
  description: string;
}

const MODES: ModeChoice[] = [
  {
    mode: "expanded",
    label: "見出し展開",
    description: "第1〜3階層を見出しにする。LLM が最も文書として読みやすい",
  },
  { mode: "raw", label: "そのまま", description: "箇条書きのまま。構造を短く伝えたいとき" },
  {
    mode: "subtree",
    label: "部分",
    description: "選択中の枝から下だけ。論点ごとに分けて渡したいとき",
  },
];

interface Props {
  mode: ExportMode;
  /** 出力結果。マップを開いていなければ null */
  result: { md: string; scope: string; fileName: string } | null;
  onChangeMode: (mode: ExportMode) => void;
  onCopy: () => void;
  onDownload: () => void;
  onClose: () => void;
}

export function ExportPanel({
  mode,
  result,
  onChangeMode,
  onCopy,
  onDownload,
  onClose,
}: Props): React.JSX.Element {
  return (
    <aside className="sheet" aria-label="AI 用の出力">
      <div className="sheet-head">
        <strong>AI 用に出力</strong>
        <button type="button" aria-label="閉じる" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="sheet-body">
        <div className="export-modes" role="radiogroup" aria-label="出力モード">
          {MODES.map((choice) => (
            <button
              type="button"
              key={choice.mode}
              role="radio"
              aria-checked={mode === choice.mode}
              className="export-mode"
              onClick={() => onChangeMode(choice.mode)}
            >
              <span className="export-mode-label">{choice.label}</span>
              <span className="export-mode-desc">{choice.description}</span>
            </button>
          ))}
        </div>

        {result === null ? (
          <p className="sheet-note">マップを開くと、ここに出力結果が出ます。</p>
        ) : (
          <>
            <p className="export-scope">
              対象: <strong>{result.scope}</strong>
            </p>
            <pre className="export-preview">{result.md}</pre>
          </>
        )}
      </div>

      <div className="sheet-foot">
        <button type="button" className="primary" disabled={result === null} onClick={onCopy}>
          コピー
        </button>
        <button type="button" disabled={result === null} onClick={onDownload}>
          .md で保存
        </button>
      </div>
    </aside>
  );
}
