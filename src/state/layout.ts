/**
 * どのペインを画面に出すかを決める（2.7-1）。
 *
 * 広い画面では一覧・主表示・欄の3つが列として並ぶが、スマートフォンの幅では
 * 固定幅の列だけで 560px あり、主表示に回る幅が残らない。狭い画面では
 * 1つだけを見せ、残りは覆いかぶせる。
 *
 * **「何が同時に置けるか」は判断であり、描画層に置くと検証できない**（規約「層の分け方」）。
 * 実際 `App.tsx` には `!showHelp && !showExport && !showSettings` という条件が
 * 既に書かれていた。狭い画面ではここに一覧が加わり、条件はさらに伸びる。
 * ここへ集めて、描画層は結果を描くだけにする。
 */

/** 右（狭い画面では下）に出る欄 */
export type SidePanel = "note" | "export" | "settings" | "help" | "history";

/** 利用者が明示的に開く欄。ノートは選択に付随して開くので含まない */
export type Sheet = Exclude<SidePanel, "note">;

export interface LayoutInput {
  /** 1ペインしか置けない画面か。測るのは描画層（`useNarrow`） */
  narrow: boolean;
  sidebarOpen: boolean;
  /** 明示的に開かれた欄。同時に1つだけに限る（設計書 7.2） */
  sheet: Sheet | null;
  /** ノードが選ばれているか */
  hasSelection: boolean;
  /**
   * 木を書き換えられる画面を出しているか。
   *
   * ホーム画面と作成画面では書き換える木が無いので false。
   * **Markdown 表示でも false になる**（2.8-1）。読むだけの画面であり、
   * 判断は `view-mode.ts` の `isEditableMode` が持つ。
   */
  editing: boolean;
}

/**
 * 何を出すか。**主表示はどちらの幅でも常に描くので、ここには現れない。**
 * 覆われている間も外さないのは、キャンバスを外すと `mind-elixir` が破棄され、
 * 拡大率と位置が失われるためである。覆いかぶせること自体は見た目の話なので、
 * `styles.css` が `:root[data-narrow]` で受け持つ。
 */
export interface Layout {
  /** マップ一覧を出すか */
  sidebar: boolean;
  /** 右または下に出す欄。無ければ null */
  panel: SidePanel | null;
  /**
   * 編集バーを出すか（2.7-5）。
   *
   * **狭い画面には構造編集の入口が他に無い。** 子や兄弟の追加・削除・改名・取り消しは
   * すべてキーボードに割り当てられており（`keymap.ts`）、`mind-elixir` の
   * 右クリックメニューとツールバーも切ってある（設計書 7.4）。
   * 指しか無い端末では、これが唯一の手段になる。
   */
  editBar: boolean;
}

/**
 * 幅の境目。この値以下を「1ペインしか置けない画面」とする。
 *
 * 一覧 15rem と欄 20rem を足すと 35rem あり、そこに主表示が入る余地はない。
 * 40rem（640px）は、その3列が成立しない幅の上限として置いている。
 */
export const NARROW_MAX_WIDTH = "40rem";

export function resolveLayout(input: LayoutInput): Layout {
  /*
   * 明示的に開いた欄が、選択に付随するノートより優先する（設計書 7.2）。
   *
   * **ノート欄は書き換えられる画面のときだけ出す**（2.8-1）。Markdown 表示は
   * ノートを含む全文をそのまま出しているので、隣に同じ内容を編集できる欄を
   * 並べると、どちらが正なのか見た目では決められなくなる。
   */
  const showNote = input.hasSelection && input.editing;
  const panel: SidePanel | null = input.sheet ?? (showNote ? "note" : null);

  if (!input.narrow) {
    // 広い画面にはキーボードがある。ツールバー1本の原則を崩す理由がない（設計書 7.2）
    return { sidebar: input.sidebarOpen, panel, editBar: false };
  }

  /*
   * 狭い画面の優先順位は 欄 > 一覧 > ノート とする。
   *
   * **明示的に開いた欄が一覧より先に来るのは、押しても何も出ないのを避けるためである。**
   * 一覧は主表示を覆うが、その上のツールバーは押せる。一覧が勝つと、
   * 一覧を開いたまま設定を押した利用者には「壊れている」としか見えない。
   *
   * **一覧がノートより先に来るのは、ノートが選択に付随して開くためである。**
   * ノートが勝つと、枝を選んだ後は一覧を開いた瞬間に覆われ、一覧に辿り着けない。
   */
  // 欄や一覧が覆っている間は編集していない。バーを残しても押す相手が見えない
  if (input.sheet !== null) return { sidebar: false, panel: input.sheet, editBar: false };
  if (input.sidebarOpen) return { sidebar: true, panel: null, editBar: false };

  // ノート欄は下半分にしか出ないので、マップは見えたままである
  return { sidebar: false, panel, editBar: input.editing };
}

/**
 * マップを開いた後に一覧を残すか。
 *
 * 狭い画面では一覧が主表示を覆っているため、残すと**開いた先が見えない。**
 * 広い画面では列として並んでいるので、閉じる理由がない。
 */
export function keepSidebarAfterOpen(narrow: boolean): boolean {
  return !narrow;
}
