import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ExportFormat } from "../core/export.js";
import { serializeMarkdown } from "../core/serialize.js";
import type { ExportScope } from "../state/commands.js";
import { exportAs, runCommand } from "../state/commands.js";
import { selectedNode, useEditor } from "../state/editor.js";
import { IMPORT_PROMPT } from "../state/import-prompt.js";
import type { Sheet } from "../state/layout.js";
import { keepSidebarAfterOpen, resolveLayout } from "../state/layout.js";
import { collectTags, queryIndex } from "../state/search.js";
import { TEMPLATES, templateMarkdown } from "../state/templates.js";
import type { Theme } from "../state/theme.js";
import { readTheme, THEME_KEY } from "../state/theme.js";
import { flatten } from "../state/tree.js";
import { isEditableMode } from "../state/view-mode.js";
import type { HistoryEntry } from "../store/types.js";
import { useWorkspace } from "../state/workspace.js";
import { Canvas } from "../views/Canvas/Canvas.js";
import { ExportPanel } from "../views/Export/ExportPanel.js";
import { NotePanel } from "../views/NotePanel/NotePanel.js";
import { Outline } from "../views/Outline/Outline.js";
import { HistoryPanel } from "../views/History/HistoryPanel.js";
import { Sidebar } from "../views/Sidebar/Sidebar.js";
import { Source } from "../views/Source/Source.js";
import { Banners } from "./Banners.js";
import type { PaletteItem } from "./command-palette.js";
import { CommandPalette } from "./CommandPalette.js";
import { downloadText } from "./download.js";
import { EditBar } from "./EditBar.js";
import { FirstBranchGuide } from "./Guide.js";
import { HomeScreen } from "./HomeScreen.js";
import { SettingsSheet } from "./SettingsSheet.js";
import { ShortcutSheet } from "./ShortcutSheet.js";
import { StartScreen } from "./StartScreen.js";
import { StatusBar } from "./StatusBar.js";
import { Toolbar } from "./Toolbar.js";
import { useKeymap } from "./useKeymap.js";
import { isNarrowNow, useNarrow } from "./useNarrow.js";

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
  const backend = useWorkspace((state) => state.backend);
  const github = useWorkspace((state) => state.github);
  const localAvailable = useWorkspace((state) => state.localAvailable);
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
  /** 取り消しの押しボタンを出し分けるために見る（`EditBar`） */
  const canUndo = useEditor((state) => state.past.length > 0);

  const [toast, setToast] = useState<string | null>(null);
  /**
   * 明示的に開いた欄。**同時に1つだけに限る**（設計書 7.2）。
   * 真偽値を3つ持つと排他を手で保つことになり、増えるたびに条件が伸びる
   */
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("heading");
  const [exportScope, setExportScope] = useState<ExportScope>("whole");
  // 狭い画面で一覧を開いた状態から始めると、起動した瞬間に全面が覆われる
  const [sidebarOpen, setSidebarOpen] = useState(() => !isNarrowNow());
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  /** 新規作成に使う下敷き（2-10） */
  const [templateId, setTemplateId] = useState("blank");
  const [showPalette, setShowPalette] = useState(false);
  /** 履歴の一覧（2.8-4）。開いている間だけ読み込む */
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const searchRef = useRef<HTMLInputElement>(null);

  /**
   * 何を画面に出すか。**判断は `src/state/layout.ts` にある**（規約「層の分け方」）。
   * ここでするのは幅を測ることと、決まった結果を描くことだけである
   */
  const narrow = useNarrow();
  const layout = resolveLayout({
    narrow,
    sidebarOpen,
    sheet,
    hasSelection: selected !== null,
    /*
     * 木を書き換えられる画面を出しているか。
     * ホーム・作成画面には編集する木が無く、Markdown 表示は読むだけである（2.8-1）。
     * `root` と `creating` の判定は下の描画と揃える
     */
    editing: root !== null && !creating && isEditableMode(mode),
  });

  /*
   * 幅を CSS からも見えるようにする（2.7-1）。
   *
   * **境目を持つのは `NARROW_MAX_WIDTH` ひとつだけにする。** メディアクエリで
   * 同じ値を書くと、片方だけ直したときに JS と CSS がずれる。
   * `StartScreen` は `.app` の外に描かれるため、印は `:root` に付ける。
   */
  useEffect(() => {
    if (narrow) document.documentElement.dataset["narrow"] = "";
    else delete document.documentElement.dataset["narrow"];
  }, [narrow]);

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

  const historyAvailable = useWorkspace((state) => state.historyAvailable);
  const readVersion = useCallback(
    (entryId: string) => useWorkspace.getState().readVersion(entryId),
    [],
  );

  // 右の欄は1つだけ出す。並べると主表示領域が狭くなる（設計書 7.2）
  const toggleSheet = useCallback((next: Sheet) => {
    setSheet((current) => (current === next ? null : next));
  }, []);

  const toggleHelp = useCallback(() => toggleSheet("help"), [toggleSheet]);
  const toggleExport = useCallback(() => toggleSheet("export"), [toggleSheet]);
  const toggleSettings = useCallback(() => toggleSheet("settings"), [toggleSheet]);
  const toggleHistory = useCallback(() => toggleSheet("history"), [toggleSheet]);

  const restoreVersion = useCallback(
    (entryId: string) => {
      void useWorkspace
        .getState()
        .restoreVersion(entryId)
        .then(() => {
          // 保存先へは書き戻していない。取り消せることをその場で伝える（設計書 8.8.3）
          notify("この版に戻しました。Ctrl+Z で取り消せます");
          toggleHistory();
        });
    },
    [notify, toggleHistory],
  );

  /*
   * ☰ は「一覧を出す／しまう」。
   *
   * 狭い画面では欄が一覧より前に出るため（`resolveLayout`）、欄を閉じないと
   * **押しても何も変わらない。** 印（`aria-pressed`）は出ていない側を指しているのに
   * 押すと逆へ倒れる、という状態も避けるため、`sidebarOpen` ではなく
   * **いま出ているか**を基準に反転させる。広い画面では両者は一致する。
   */
  const toggleSidebar = useCallback(() => {
    if (narrow) setSheet(null);
    setSidebarOpen(!layout.sidebar);
  }, [narrow, layout.sidebar]);

  // 検索は畳んだサイドバーの中にある。開かずに入力位置だけ移しても何も見えない
  const focusSearch = useCallback(() => {
    if (narrow) setSheet(null);
    setSidebarOpen(true);
    requestAnimationFrame(() => searchRef.current?.select());
  }, [narrow]);

  const openPalette = useCallback(() => {
    setShowPalette((open) => !open);
  }, []);

  const deps = useMemo(
    () => ({
      notify,
      toggleHelp,
      toggleSidebar,
      focusSearch,
      toggleExport,
      toggleHistory,
      openPalette,
    }),
    [notify, toggleHelp, toggleSidebar, focusSearch, toggleExport, toggleHistory, openPalette],
  );

  useKeymap(deps);

  const historyOpen = layout.panel === "history";

  /*
   * 差分の右側になる「今の内容」。**開いている間だけ作る。**
   * 保存されるのと同じ関数から出すので（`Source.tsx` と同じ理由）、
   * 差分に出る内容と実際に書かれる内容が食い違わない
   */
  const currentMarkdown = useEditor((state) => {
    if (!historyOpen) return "";
    const doc = state.buildDoc();
    return doc === null ? "" : serializeMarkdown(doc);
  });

  /** 保存が終わるたびに一覧を取り直す。控えは保存の直後に増える（設計書 8.8.1） */
  const savedAt = status.kind === "saved" ? status.at : 0;

  useEffect(() => {
    if (!historyOpen) return undefined;
    let alive = true;
    setHistoryLoading(true);
    void useWorkspace
      .getState()
      .listHistory()
      .then((entries) => {
        if (!alive) return;
        setHistoryEntries(entries);
        setHistoryLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [historyOpen, savedAt, map?.id]);

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
  const showExport = layout.panel === "export";
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

  /**
   * マップを開く。狭い画面では一覧が主表示を覆っているため、
   * 残したままだと**開いた先が見えない**（`keepSidebarAfterOpen`）
   */
  const openMap = useCallback(
    (id: string) => {
      if (!keepSidebarAfterOpen(narrow)) setSidebarOpen(false);
      void useWorkspace.getState().openMap(id);
    },
    [narrow],
  );

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
      if (item.kind === "map") openMap(item.id);
      if (item.kind === "template") startCreating(item.id);
    },
    [deps, startCreating, openMap],
  );

  if (backend.kind !== "ready") {
    return (
      <StartScreen
        backend={backend}
        onChoose={() => void useWorkspace.getState().chooseFolder()}
        onGrant={() => void useWorkspace.getState().grantPermission()}
        onConnect={(input, remember) => useWorkspace.getState().connectGitHub(input, remember)}
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
    <div className={`app${layout.sidebar ? "" : " is-sidebar-closed"}`}>
      <Toolbar
        title={map?.meta.title ?? "マップを開いてください"}
        onHome={goHome}
        mode={mode}
        canEdit={root !== null}
        narrow={narrow}
        sidebarOpen={layout.sidebar}
        onToggleSidebar={toggleSidebar}
        onChangeMode={(next) => useEditor.getState().setMode(next)}
        onToggleExport={toggleExport}
        exportOpen={showExport}
        onToggleHistory={toggleHistory}
        historyOpen={layout.panel === "history"}
        onNewMap={() => startCreating("blank")}
        onToggleHelp={toggleHelp}
        helpOpen={layout.panel === "help"}
        onToggleSettings={toggleSettings}
        settingsOpen={layout.panel === "settings"}
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
        {layout.sidebar && (
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
            onOpen={openMap}
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
              {mode === "canvas" && <Canvas />}
              {mode === "outline" && <Outline />}
              {mode === "source" && <Source />}
              {/* 最初の枝の案内は、枝を足せる画面でだけ出す */}
              {!rootHasChildren && isEditableMode(mode) && <FirstBranchGuide />}
            </>
          )}
        </main>

        {layout.panel === "export" && (
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

        {layout.panel === "settings" && (
          <SettingsSheet
            backend={backend}
            github={github}
            localAvailable={localAvailable}
            theme={theme}
            onChangeTheme={changeTheme}
            onChooseFolder={() => void useWorkspace.getState().chooseFolder()}
            onUseLocalFolder={() => void useWorkspace.getState().useLocalFolder()}
            onUseGitHub={() => void useWorkspace.getState().useGitHub()}
            onDisconnectGitHub={() => void useWorkspace.getState().disconnectGitHub()}
            onConnect={(input, remember) => useWorkspace.getState().connectGitHub(input, remember)}
            onShowShortcuts={toggleHelp}
            onShowExport={toggleExport}
            onShowHistory={toggleHistory}
            canExport={root !== null}
            onClose={toggleSettings}
          />
        )}

        {layout.panel === "history" && (
          <HistoryPanel
            entries={historyEntries}
            loading={historyLoading}
            available={historyAvailable}
            current={currentMarkdown}
            onRead={readVersion}
            onRestore={restoreVersion}
            onClose={toggleHistory}
          />
        )}

        {layout.panel === "help" && <ShortcutSheet onClose={toggleHelp} />}

        {layout.panel === "note" && selected !== null && (
          <NotePanel
            node={selected}
            linkCandidates={linkCandidates}
            // 狭い画面ではノート欄が主表示に重なるため、閉じる手段が要る。
            // 広い画面では列として並ぶので閉じるものがない
            onClose={narrow ? () => useEditor.getState().select(null) : undefined}
            onChange={(note) => useEditor.getState().writeNote(note)}
            onChangeEmoji={(emoji) => useEditor.getState().setEmoji(emoji)}
            onAddLink={(label) => useEditor.getState().addLink(label)}
          />
        )}
      </div>

      {/*
       * 狭い画面の編集バー（2.7-5）。**ここが唯一の構造編集の入口である。**
       * 追加・改名・削除・取り消しはすべてキーボードにしか割り当てておらず、
       * mind-elixir の右クリックメニューも切ってある（設計書 7.4）
       */}
      {layout.editBar && (
        <EditBar
          hasSelection={selected !== null}
          canUndo={canUndo}
          onRun={(command) => void runCommand(command, { copyText, ...deps })}
        />
      )}

      <StatusBar
        status={status}
        nodeCount={root === null ? 0 : flatten(root).length}
        label={backend.label}
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
