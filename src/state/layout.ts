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
export type SidePanel = "note" | "export" | "settings" | "help";

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
}

/**
 * 幅の境目。この値以下を「1ペインしか置けない画面」とする。
 *
 * 一覧 15rem と欄 20rem を足すと 35rem あり、そこに主表示が入る余地はない。
 * 40rem（640px）は、その3列が成立しない幅の上限として置いている。
 */
export const NARROW_MAX_WIDTH = "40rem";

export function resolveLayout(input: LayoutInput): Layout {
  // 明示的に開いた欄が、選択に付随するノートより優先する（設計書 7.2）
  const panel: SidePanel | null = input.sheet ?? (input.hasSelection ? "note" : null);

  if (!input.narrow) {
    return { sidebar: input.sidebarOpen, panel };
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
  if (input.sheet !== null) return { sidebar: false, panel: input.sheet };
  if (input.sidebarOpen) return { sidebar: true, panel: null };

  return { sidebar: false, panel };
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
