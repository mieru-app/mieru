import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ExportMode } from "../core/export.js";
import { exportAs } from "../state/commands.js";
import { selectedNode, useEditor } from "../state/editor.js";
import { collectTags, queryIndex } from "../state/search.js";
import { flatten } from "../state/tree.js";
import { useWorkspace } from "../state/workspace.js";
import { Canvas } from "../views/Canvas/Canvas.js";
import { ExportPanel } from "../views/Export/ExportPanel.js";
import { NotePanel } from "../views/NotePanel/NotePanel.js";
import { Outline } from "../views/Outline/Outline.js";
import { Sidebar } from "../views/Sidebar/Sidebar.js";
import { Banners } from "./Banners.js";
import { downloadText } from "./download.js";
import { FirstBranchGuide, NoMapGuide } from "./Guide.js";
import { ShortcutSheet } from "./ShortcutSheet.js";
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
  const indexes = useWorkspace((state) => state.indexes);
  const workspaceError = useWorkspace((state) => state.error);
  const externallyChanged = useWorkspace((state) => state.externallyChanged);
  const quarantined = useWorkspace((state) => state.quarantined);

  const map = useEditor((state) => state.map);
  const root = useEditor((state) => state.root);
  const mode = useEditor((state) => state.mode);
  const status = useEditor((state) => state.status);
  const selected = useEditor(selectedNode);

  const selectedUid = useEditor((state) => state.selectedUid);

  const [toast, setToast] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>("expanded");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
  }, []);

  // 右の欄は1つだけ出す。並べると主表示領域が狭くなる（設計書 7.2）
  const toggleHelp = useCallback(() => {
    setShowExport(false);
    setShowHelp((open) => !open);
  }, []);

  const toggleExport = useCallback(() => {
    setShowHelp(false);
    setShowExport((open) => !open);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => !open);
  }, []);

  // 検索は畳んだサイドバーの中にある。開かずに入力位置だけ移しても何も見えない
  const focusSearch = useCallback(() => {
    setSidebarOpen(true);
    requestAnimationFrame(() => searchRef.current?.select());
  }, []);

  useKeymap({ notify, toggleHelp, toggleSidebar, focusSearch, toggleExport });

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

  const hits = useMemo(
    () => queryIndex(indexes, { query, tags: activeTags }),
    [indexes, query, activeTags],
  );
  const tags = useMemo(() => collectTags(indexes), [indexes]);

  // 木や選択が動けば出力も変わる。開いている間だけ作り直す。
  // exportAs はストアから直に読むため、root と selectedUid は再計算の契機として渡している
  const exported = useMemo(
    () => (showExport ? exportAs(exportMode) : null),
    [showExport, exportMode, root, selectedUid],
  );

  // 横断リンクの宛先候補。自分自身と無題のノードは除く（F-17）
  const linkCandidates = useMemo(() => {
    if (root === null) return [];
    const labels = flatten(root)
      .map((node) => node.label)
      .filter((label) => label !== "" && label !== selected?.label);
    return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
  }, [root, selected]);

  const startCreating = useCallback(() => {
    setSidebarOpen(true);
    setCreating(true);
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

  const rootHasChildren = root !== null && root.children.length > 0;

  // 削除だけはモーダルで確認する（設計書 7.2 の唯一の例外）。
  // 消したファイルは Undo で戻せないため、ここは省かない
  const confirmDelete = (id: string, title: string): void => {
    if (!window.confirm(`「${title}」を削除します。元に戻せません。`)) return;
    void useWorkspace.getState().deleteMap(id);
  };

  return (
    <div className={`app${sidebarOpen ? "" : " is-sidebar-closed"}`}>
      <Toolbar
        title={map?.meta.title ?? "マップを開いてください"}
        mode={mode}
        canEdit={root !== null}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        onChangeMode={(next) => useEditor.getState().setMode(next)}
        onToggleExport={toggleExport}
        exportOpen={showExport}
        onNewMap={startCreating}
        onToggleHelp={toggleHelp}
        helpOpen={showHelp}
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
        {sidebarOpen && (
          <Sidebar
            hits={hits}
            tags={tags}
            activeTags={activeTags}
            query={query}
            searching={query.trim() !== ""}
            openId={map?.id ?? null}
            empty={maps.length === 0}
            creating={creating}
            searchRef={searchRef}
            onCreatingChange={setCreating}
            onQueryChange={setQuery}
            onToggleTag={(tag) =>
              setActiveTags((current) =>
                current.includes(tag)
                  ? current.filter((other) => other !== tag)
                  : [...current, tag],
              )
            }
            onOpen={(id) => void useWorkspace.getState().openMap(id)}
            onCreate={(title) => void useWorkspace.getState().createMap(title)}
            onRename={(id, title) => void useWorkspace.getState().renameMap(id, title)}
            onDelete={confirmDelete}
          />
        )}

        <main className="main">
          {root === null ? (
            <NoMapGuide hasMaps={maps.length > 0} onNewMap={startCreating} />
          ) : (
            <>
              {mode === "canvas" ? <Canvas /> : <Outline />}
              {!rootHasChildren && <FirstBranchGuide />}
            </>
          )}
        </main>

        {showExport && (
          <ExportPanel
            mode={exportMode}
            result={exported}
            onChangeMode={setExportMode}
            onClose={toggleExport}
            onCopy={() => {
              if (exported === null) return;
              void copyText(exported.md).then(
                () => notify("Markdown をコピーしました"),
                () => notify("クリップボードへコピーできませんでした"),
              );
            }}
            onDownload={() => {
              if (exported === null) return;
              downloadText(exported.fileName, exported.md);
            }}
          />
        )}

        {showHelp && <ShortcutSheet onClose={toggleHelp} />}

        {selected !== null && !showHelp && !showExport && (
          <NotePanel
            node={selected}
            linkCandidates={linkCandidates}
            onChange={(note) => useEditor.getState().writeNote(note)}
            onChangeEmoji={(emoji) => useEditor.getState().setEmoji(emoji)}
            onAddLink={(label) => useEditor.getState().addLink(label)}
          />
        )}
      </div>

      <StatusBar
        status={status}
        nodeCount={root === null ? 0 : flatten(root).length}
        folderName={folder.folderName}
        hint={root === null ? "newMap" : rootHasChildren ? "help" : "firstBranch"}
      />

      {toast !== null && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
