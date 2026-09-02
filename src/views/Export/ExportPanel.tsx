import type { ExportFormat } from "../../core/export.js";
import type { ExportScope } from "../../state/commands.js";

/**
 * テキスト出力パネル（F-33 / F-35）。
 *
 * 選択肢は「形式」と「範囲」の2軸に分けてある。以前は3つを1列に並べていたが、
 * 前2つが書き方、3つ目が範囲であり、同格ではなかった（設計書 7.3 の経緯）。
 *
 * 違いは説明より現物を見た方が早いので、選ぶとその場で結果を出す。
 * 何が渡るのか分からないまま貼り付けるのが、この道具でいちばん困る状況である。
 *
 * 仕様の正本: docs/design.md 7.3
 */

interface Choice<T> {
  value: T;
  label: string;
  description: string;
}

const FORMATS: Choice<ExportFormat>[] = [
  {
    value: "heading",
    label: "見出し",
    description: "第1〜3階層を見出しにする。文書として読ませたいとき",
  },
  {
    value: "bullet",
    label: "箇条書き",
    description: "保存されている形のまま。構造を短く伝えたいとき",
  },
];

const SCOPES: Choice<ExportScope>[] = [
  { value: "whole", label: "全体", description: "マップ全部" },
  { value: "selection", label: "選択部分", description: "選んでいる枝から下だけ" },
];

interface AxisProps<T extends string> {
  title: string;
  choices: Choice<T>[];
  current: T;
  onChange: (value: T) => void;
}

function Axis<T extends string>({
  title,
  choices,
  current,
  onChange,
}: AxisProps<T>): React.JSX.Element {
  return (
    <div className="export-axis" role="radiogroup" aria-label={title}>
      <span className="export-axis-label">{title}</span>
      <div className="export-modes">
        {choices.map((choice) => (
          <button
            type="button"
            key={choice.value}
            role="radio"
            aria-checked={current === choice.value}
            className="export-mode"
            onClick={() => onChange(choice.value)}
          >
            <span className="export-mode-label">{choice.label}</span>
            <span className="export-mode-desc">{choice.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  format: ExportFormat;
  scope: ExportScope;
  /** 出力結果。マップを開いていなければ null */
  result: { md: string; scope: string; fileName: string } | null;
  onChangeFormat: (format: ExportFormat) => void;
  onChangeScope: (scope: ExportScope) => void;
  onCopy: () => void;
  onDownload: () => void;
  onClose: () => void;
}

export function ExportPanel({
  format,
  scope,
  result,
  onChangeFormat,
  onChangeScope,
  onCopy,
  onDownload,
  onClose,
}: Props): React.JSX.Element {
  return (
    <aside className="sheet" aria-label="テキスト出力">
      <div className="sheet-head">
        <strong>テキスト出力</strong>
        <button type="button" aria-label="閉じる" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="sheet-body">
        <Axis title="形式" choices={FORMATS} current={format} onChange={onChangeFormat} />
        <Axis title="範囲" choices={SCOPES} current={scope} onChange={onChangeScope} />

        {result === null ? (
          <p className="sheet-note">マップを開くと、ここに出力結果が出ます。</p>
        ) : (
          <>
            {/* 中心テーマを選んでいると選択部分でも全体が出る。対象を常に名乗らせる */}
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
