import type { SaveStatus } from "../state/types.js";

/**
 * 保存状態を常時表示する。
 * 「保存ボタンを探す」体験を作らないための表示であり、
 * 保存できていない状況では、内容が失われていないことも併せて伝える（原則4）。
 */

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function describe(status: SaveStatus): { tone: string; text: string } {
  switch (status.kind) {
    case "empty":
      return { tone: "muted", text: "マップを開いていません" };
    case "saved":
      return { tone: "ok", text: `保存済み ${timeOf(status.at)}` };
    case "dirty":
      return { tone: "muted", text: "未保存の変更があります" };
    case "saving":
      return { tone: "muted", text: "保存中…" };
    case "conflict":
      return { tone: "warn", text: "外部で更新されています（未保存の変更は保持しています）" };
    case "failed":
      return { tone: "warn", text: `保存できません: ${status.reason}` };
  }
}

interface Props {
  status: SaveStatus;
  nodeCount: number;
  folderName: string | null;
}

export function StatusBar({ status, nodeCount, folderName }: Props): React.JSX.Element {
  const { tone, text } = describe(status);
  return (
    <footer className="statusbar">
      <span className={`status status-${tone}`}>{text}</span>
      {folderName !== null && <span className="statusbar-item">{folderName}</span>}
      {nodeCount > 0 && <span className="statusbar-item">{nodeCount} ノード</span>}
      <span className="statusbar-hint">Ctrl+Shift+C で AI 用 Markdown をコピー</span>
    </footer>
  );
}
