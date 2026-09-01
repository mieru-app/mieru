import { useCallback, useEffect, useState } from "react";

import { runCommand } from "../state/commands.js";
import { selectedNode, useEditor } from "../state/editor.js";
import { flatten } from "../state/tree.js";
import { useWorkspace } from "../state/workspace.js";
import { Canvas } from "../views/Canvas/Canvas.js";
import { NotePanel } from "../views/NotePanel/NotePanel.js";
import { Outline } from "../views/Outline/Outline.js";
import { Banners } from "./Banners.js";
import { MapList } from "./MapList.js";
import { StartScreen } from "./StartScreen.js";
import { StatusBar } from "./StatusBar.js";
import { Toolbar } from "./Toolbar.js";
import { useKeymap } from "./useKeymap.js";

/**
 * 画面全体の組み立て。
 *
 * 画面はモード2つ・ツールバー1本に限る（設計書 7.2）。
 * ここに要素を足したくなったら、まず設計書 2.2「対象外」を読むこと。
 */

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function App(): React.JSX.Element {
  const folder = useWorkspace((state) => state.folder);
  const maps = useWorkspace((state) => state.maps);
  const workspaceError = useWorkspace((state) => state.error);
  const externallyChanged = useWorkspace((state) => state.externallyChanged);
  const quarantined = useWorkspace((state) => state.quarantined);

  const map = useEditor((state) => state.map);
  const root = useEditor((state) => state.root);
  const mode = useEditor((state) => state.mode);
  const status = useEditor((state) => state.status);
  const selected = useEditor(selectedNode);

  const [toast, setToast] = useState<string | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
  }, []);

  useKeymap(notify);

  useEffect(() => {
    void useWorkspace.getState().init();
  }, []);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 2_500);
    return () => clearTimeout(timer);
  }, [toast]);

  // 画面を離れる前に書きかけを保存する。自動保存の猶予中に閉じられても失わないため
  useEffect(() => {
    const onHide = (): void => {
      void useWorkspace.getState().saveNow();
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  if (folder.kind !== "ready") {
    return (
      <StartScreen
        folder={folder}
        onChoose={() => void useWorkspace.getState().chooseFolder()}
        onGrant={() => void useWorkspace.getState().grantPermission()}
      />
    );
  }

  const newMap = (): void => {
    const title = window.prompt("新しいマップの中心テーマ", "新しいマップ");
    if (title === null) return;
    void useWorkspace.getState().createMap(title.trim() === "" ? "新しいマップ" : title.trim());
  };

  return (
    <div className="app">
      <Toolbar
        title={map?.meta.title ?? "マップを開いてください"}
        mode={mode}
        canEdit={root !== null}
        onChangeMode={(next) => useEditor.getState().setMode(next)}
        onCopyForAi={() => void runCommand("copyForAi", { copyText, notify })}
        onNewMap={newMap}
      />

      <Banners
        status={status}
        externallyChanged={externallyChanged}
        workspaceError={workspaceError}
        quarantined={quarantined}
        onReload={() => void useWorkspace.getState().reloadOpen()}
        onKeepMine={() => void useWorkspace.getState().overwriteWithMine()}
        onRestore={(entry) => void useWorkspace.getState().restoreQuarantined(entry)}
        onDiscard={(entry) => void useWorkspace.getState().discardQuarantined(entry)}
      />

      <div className="workarea">
        <MapList
          maps={maps}
          openId={map?.id ?? null}
          onOpen={(id) => void useWorkspace.getState().openMap(id)}
        />

        <main className="main">
          {root === null ? (
            <p className="main-empty">左の一覧からマップを開くか、新しく作成してください。</p>
          ) : mode === "canvas" ? (
            <Canvas />
          ) : (
            <Outline />
          )}
        </main>

        {selected !== null && (
          <NotePanel node={selected} onChange={(note) => useEditor.getState().writeNote(note)} />
        )}
      </div>

      <StatusBar
        status={status}
        nodeCount={root === null ? 0 : flatten(root).length}
        folderName={folder.folderName}
      />

      {toast !== null && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
