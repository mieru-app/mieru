import { useLanguage } from "../state/i18n.js";
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
  /** ゲストモードか。**保存されていないことを出し続ける** */
  guest: boolean;
  onChooseStorage: () => void;
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
  guest,
  onChooseStorage,
  status,
  externallyChanged,
  workspaceError,
  quarantined,
  onReload,
  onKeepMine,
  onRestore,
  onDiscard,
}: Props): React.JSX.Element | null {
  const s = useLanguage((state) => state.s);
  const banners: React.JSX.Element[] = [];

  /*
   * **ゲストの帯は消せない**（2.12）。中身はメモリにしか無く、
   * タブを閉じれば消える。**「保存していない」と言い続けることが、
   * 保存先を先に聞かない代わりに引き受けた義務である。**
   * 先頭に置くのは、他の帯より先に目に入れるため
   */
  if (guest) {
    banners.push(
      <div className="banner banner-guest" key="guest" role="status">
        <span>{s.banner.guest}</span>
        <button type="button" onClick={onChooseStorage}>
          {s.banner.chooseStorage}
        </button>
      </div>,
    );
  }

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
        <span>{s.banner.conflict}</span>
        <button type="button" onClick={onReload}>
          {s.banner.loadExternal}
        </button>
        <button type="button" onClick={onKeepMine}>
          {s.banner.keepMine}
        </button>
      </div>,
    );
  } else if (externallyChanged) {
    banners.push(
      <div className="banner" key="external" role="status">
        <span>{s.banner.externallyChanged}</span>
        <button type="button" onClick={onReload}>
          {s.banner.reload}
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
        <span>{s.banner.quarantined(entry.id, new Date(entry.at).toLocaleString(s.locale))}</span>
        <button type="button" onClick={() => onRestore(entry)}>
          {s.banner.restore}
        </button>
        <button type="button" onClick={() => onDiscard(entry)}>
          {s.banner.discard}
        </button>
      </div>,
    );
  }

  return banners.length === 0 ? null : <div className="banners">{banners}</div>;
}
