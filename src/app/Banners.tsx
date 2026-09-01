import type { QuarantinedEntry } from "../store/quarantine.js";
import type { SaveStatus } from "../state/types.js";

/**
 * 注意を要する状態の帯。
 *
 * モーダルダイアログを使わない方針のため（設計書 7.2）、
 * 判断が要る事柄はここに出し、作業を止めずに選べるようにする。
 * どの帯も「編集内容は失われていない」ことを明示する。
 */

interface Props {
  status: SaveStatus;
  externallyChanged: boolean;
  workspaceError: string | null;
  quarantined: QuarantinedEntry[];
  onReload: () => void;
  onKeepMine: () => void;
  onRestore: (entry: QuarantinedEntry) => void;
  onDiscard: (entry: QuarantinedEntry) => void;
}

export function Banners({
  status,
  externallyChanged,
  workspaceError,
  quarantined,
  onReload,
  onKeepMine,
  onRestore,
  onDiscard,
}: Props): React.JSX.Element | null {
  const banners: React.JSX.Element[] = [];

  if (workspaceError !== null) {
    banners.push(
      <div className="banner banner-warn" key="workspace-error" role="alert">
        <span>{workspaceError}</span>
      </div>,
    );
  }

  if (status.kind === "conflict") {
    banners.push(
      <div className="banner banner-warn" key="conflict" role="alert">
        <span>
          このマップは他のアプリからも更新されています。自動保存は止めています（入力は保持しています）。
        </span>
        <button type="button" onClick={onReload}>
          外部の内容を読み込む
        </button>
        <button type="button" onClick={onKeepMine}>
          こちらの内容で上書きする
        </button>
      </div>,
    );
  } else if (externallyChanged) {
    banners.push(
      <div className="banner" key="external" role="status">
        <span>ファイルが外部で更新されました。</span>
        <button type="button" onClick={onReload}>
          読み込み直す
        </button>
      </div>,
    );
  }

  if (status.kind === "failed") {
    banners.push(
      <div className="banner banner-warn" key="failed" role="alert">
        <span>{status.reason}</span>
      </div>,
    );
  }

  for (const entry of quarantined) {
    banners.push(
      <div className="banner" key={`quarantine-${entry.key}`} role="status">
        <span>
          保存できずに退避した内容があります（{entry.id} /{" "}
          {new Date(entry.at).toLocaleString("ja-JP")}）。
        </span>
        <button type="button" onClick={() => onRestore(entry)}>
          復元する
        </button>
        <button type="button" onClick={() => onDiscard(entry)}>
          破棄する
        </button>
      </div>,
    );
  }

  return banners.length === 0 ? null : <div className="banners">{banners}</div>;
}
