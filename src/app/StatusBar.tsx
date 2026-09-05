import { useLanguage } from "../state/i18n.js";
import type { Strings } from "../state/strings/ja.js";
import type { SaveStatus } from "../state/types.js";

/**
 * 保存状態を常時表示する。
 * 「保存ボタンを探す」体験を作らないための表示であり、
 * 保存できていない状況では、内容が失われていないことも併せて伝える（原則4）。
 */

function timeOf(at: number, locale: string): string {
  return new Date(at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function describe(status: SaveStatus, s: Strings): { tone: string; text: string } {
  switch (status.kind) {
    case "empty":
      return { tone: "muted", text: s.status.empty };
    case "saved":
      return { tone: "ok", text: s.status.saved(timeOf(status.at, s.locale)) };
    case "dirty":
      return { tone: "muted", text: s.status.dirty };
    case "saving":
      return { tone: "muted", text: s.status.saving };
    case "conflict":
      return { tone: "warn", text: s.status.conflict };
    case "failed":
      return { tone: "warn", text: s.status.failed(status.reason) };
  }
}

/** 状況に応じて出す案内。今この場で次に押すキーを示す */
export type StatusHint = "newMap" | "firstBranch" | "help";

const HINTS: Record<StatusHint, (s: Strings) => string> = {
  newMap: (s) => s.status.hintNewMap,
  firstBranch: (s) => s.status.hintFirstBranch,
  help: (s) => s.status.hintHelp,
};

interface Props {
  status: SaveStatus;
  nodeCount: number;
  /** 保存先の表示名（フォルダ名、または owner/repo） */
  label: string | null;
  hint: StatusHint;
}

export function StatusBar({ status, nodeCount, label, hint }: Props): React.JSX.Element {
  const s = useLanguage((state) => state.s);
  const { tone, text } = describe(status, s);
  return (
    <footer className="statusbar">
      <span className={`status status-${tone}`}>{text}</span>
      {label !== null && <span className="statusbar-item">{label}</span>}
      {nodeCount > 0 && <span className="statusbar-item">{s.status.nodes(nodeCount)}</span>}
      <span className="statusbar-hint">{HINTS[hint](s)}</span>
    </footer>
  );
}
