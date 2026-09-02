import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ExportFormat } from "../core/export.js";
import type { ExportScope } from "../state/commands.js";
import { exportAs, runCommand } from "../state/commands.js";
import { selectedNode, useEditor } from "../state/editor.js";
import { IMPORT_PROMPT } from "../state/import-prompt.js";
import { collectTags, queryIndex } from "../state/search.js";
import { TEMPLATES, templateMarkdown } from "../state/templates.js";
import type { Theme } from "../state/theme.js";
import { readTheme, THEME_KEY } from "../state/theme.js";
import { flatten } from "../state/tree.js";
import { useWorkspace } from "../state/workspace.js";
import { Canvas } from "../views/Canvas/Canvas.js";
import { ExportPanel } from "../views/Export/ExportPanel.js";
import { NotePanel } from "../views/NotePanel/NotePanel.js";
import { Outline } from "../views/Outline/Outline.js";
import { Sidebar } from "../views/Sidebar/Sidebar.js";
import { Banners } from "./Banners.js";
import type { PaletteItem } from "./command-palette.js";
import { CommandPalette } from "./CommandPalette.js";
import { downloadText } from "./download.js";
import { FirstBranchGuide } from "./Guide.js";
import { HomeScreen } from "./HomeScreen.js";
import { SettingsSheet } from "./SettingsSheet.js";
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
  const [exportFormat, setExportFormat] = useState<ExportFormat>("heading");
  const [exportScope, setExportScope] = useState<ExportScope>("whole");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  /** 新規作成に使う下敷き（2-10） */
  const [templateId, setTemplateId] = useState("blank");
  const [showPalette, setShowPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const searchRef = useRef<HTMLInputElement>(null);

  // 保存済みの配色を読む。壊れた値でも既定へ倒れる（`readTheme`）
  useEffect(() => {
    setTheme(readTheme(localStorage.getItem(THEME_KEY)));
  }, []);

  useEffect(() => {
    // system のときは属性を外し、OS の設定（prefers-color-scheme）に委ねる
    if (theme === "system") delete document.documentElement.dataset["theme"];
    else document.documentElement.dataset["theme"] = theme;
  }, [theme]);

  const changeTheme = useCallback((next: Theme) => {
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
  }, []);

  // 右の欄は1つだけ出す。並べると主表示領域が狭くなる（設計書 7.2）
  const toggleHelp = useCallback(() => {
    setShowExport(false);
    setShowSettings(false);
    setShowHelp((open) => !open);
  }, []);

  const toggleExport = useCallback(() => {
    setShowHelp(false);
    setShowSettings(false);
    setShowExport((open) => !open);
  }, []);

  const toggleSettings = useCallback(() => {
    setShowHelp(false);
    setShowExport(false);
    setShowSettings((open) => !open);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => !open);
  }, []);

  // 検索は畳んだサイドバーの中にある。開かずに入力位置だけ移しても何も見えない
  const focusSearch = useCallback(() => {
    setSidebarOpen(true);
    requestAnimationFrame(() => searchRef.current?.select());
  }, []);

  const openPalette = useCallback(() => {
    setShowPalette((open) => !open);
  }, []);

  const deps = useMemo(
    () => ({ notify, toggleHelp, toggleSidebar, focusSearch, toggleExport, openPalette }),
    [notify, toggleHelp, toggleSidebar, focusSearch, toggleExport, openPalette],
  );

  useKeymap(deps);

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
    () => (showExport ? exportAs(exportFormat, exportScope) : null),
    [showExport, exportFormat, exportScope, root, selectedUid],
  );

  // 横断リンクの宛先候補。自分自身と無題のノードは除く（F-17）
  const linkCandidates = useMemo(() => {
    if (root === null) return [];
    const labels = flatten(root)
      .map((node) => node.label)
      .filter((label) => label !== "" && label !== selected?.label);
    return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
  }, [root, selected]);

  /**
   * 新規作成の入力を始める。作成画面は主表示領域に出るので、
   * サイドバーは開かない（設計書 7.2）。
   *
   * 引数を省略した呼び出しは `() => startCreating()` と書くこと。
   * `onClick={startCreating}` と渡すとクリックイベントが下敷き id として入る
   */
  const startCreating = useCallback((template: string) => {
    setTemplateId(template);
    setCreating(true);
  }, []);

  /** ホームへ戻る。作成中なら作成をやめる（F-38） */
  const goHome = useCallback(() => {
    setCreating(false);
    void useWorkspace.getState().closeMap();
  }, []);

  /** 取り込み指示をクリップボードへ入れる（F-36） */
  const copyImportPrompt = useCallback(() => {
    void copyText(IMPORT_PROMPT).then(
      () => notify("取り込み指示をコピーしました"),
      () => notify("クリップボードへコピーできませんでした"),
    );
  }, [notify]);

  /** パレットで選ばれた項目を実行する。何を選んでもパレットは閉じる */
  const pick = useCallback(
    (item: PaletteItem) => {
      setShowPalette(false);
      if (item.kind === "command") void runCommand(item.command, { copyText, ...deps });
      if (item.kind === "map") void useWorkspace.getState().openMap(item.id);
      if (item.kind === "template") startCreating(item.id);
    },
    [deps, startCreating],
  );

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
        onHome={goHome}
        mode={mode}
        canEdit={root !== null}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        onChangeMode={(next) => useEditor.getState().setMode(next)}
        onToggleExport={toggleExport}
        exportOpen={showExport}
        onNewMap={() => startCreating("blank")}
        onToggleHelp={toggleHelp}
        helpOpen={showHelp}
        onToggleSettings={toggleSettings}
        settingsOpen={showSettings}
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
            searchRef={searchRef}
            onNewMap={() => startCreating("blank")}
            onQueryChange={setQuery}
            onToggleTag={(tag) =>
              setActiveTags((current) =>
                current.includes(tag)
                  ? current.filter((other) => other !== tag)
                  : [...current, tag],
              )
            }
            onOpen={(id) => void useWorkspace.getState().openMap(id)}
            onRename={(id, title) => void useWorkspace.getState().renameMap(id, title)}
            onDelete={confirmDelete}
          />
        )}

        <main className="main">
          {/*
           * 作成中はマップを開いていても作成画面に譲る。
           * 入力する場所が毎回同じであるほうが迷わない（設計書 7.2）
           */}
          {root === null || creating ? (
            <HomeScreen
              creating={creating}
              hasMaps={maps.length > 0}
              templates={TEMPLATES}
              templateId={templateId}
              onTemplateChange={setTemplateId}
              onStartCreating={() => startCreating("blank")}
              onCancelCreating={() => setCreating(false)}
              onCreate={(title) => {
                setCreating(false);
                void useWorkspace.getState().createMap(title, templateMarkdown(templateId));
              }}
              onCopyImportPrompt={copyImportPrompt}
            />
          ) : (
            <>
              {mode === "canvas" ? <Canvas /> : <Outline />}
              {!rootHasChildren && <FirstBranchGuide />}
            </>
          )}
        </main>

        {showExport && (
          <ExportPanel
            format={exportFormat}
            scope={exportScope}
            result={exported}
            onChangeFormat={setExportFormat}
            onChangeScope={setExportScope}
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

        {showSettings && (
          <SettingsSheet
            folderName={folder.folderName}
            theme={theme}
            onChangeTheme={changeTheme}
            onChooseFolder={() => void useWorkspace.getState().chooseFolder()}
            onShowShortcuts={toggleHelp}
            onClose={toggleSettings}
          />
        )}

        {showHelp && <ShortcutSheet onClose={toggleHelp} />}

        {selected !== null && !showHelp && !showExport && !showSettings && (
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

      {showPalette && (
        <CommandPalette indexes={indexes} onClose={() => setShowPalette(false)} onPick={pick} />
      )}

      {toast !== null && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
