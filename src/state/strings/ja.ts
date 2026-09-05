/**
 * 日本語の文言表（2.12）。
 *
 * **この表の形が、そのまま英語表の型になる**（`en.ts`）。
 * 鍵を足してこちらだけ書くと、英語表が型検査で落ちる。
 * **訳し漏れたまま公開されることが構造的に起きない。**
 *
 * 差し込みのある文言は関数にする。`{0}` のような差し込み記法を自前で作ると、
 * 引数の数と型を検査できなくなる。
 *
 * 画面ごとに束ねる。**鍵の名前は「どこに出るか」で付け、文言では付けない。**
 * 文言で付けると、言い回しを変えるたびに鍵まで変える羽目になる。
 */

export const JA = {
  /** 日付と時刻の書式に使う。`toLocaleString` へ渡す */
  locale: "ja-JP",

  viewMode: {
    canvas: "キャンバス",
    outline: "アウトライン",
    source: ".md",
    /**
     * 狭い画面で使う短い字。
     * **360px の画面には正式な名前が3つ入らない**（`view-mode.ts`）。
     */
    canvasShort: "図",
    outlineShort: "リスト",
    sourceShort: "MD",
  },

  toolbar: {
    sidebar: "サイドバーの開閉",
    home: "ホームへ戻る",
    viewSwitch: "表示の切り替え",
    export: "出力",
    exportHint: "Ctrl+Shift+C ですぐコピーもできます",
    history: "履歴",
    historyHint: "過去の版を見て戻す",
    newMap: "新規作成",
    shortcuts: "ヘルプ",
    settings: "設定",
  },

  status: {
    empty: "マップを開いていません",
    saved: (time: string) => `保存済み ${time}`,
    dirty: "未保存の変更があります",
    saving: "保存中…",
    conflict: "外部で更新されています（未保存の変更は保持しています）",
    failed: (reason: string) => `保存できません: ${reason}`,
    nodes: (count: number) => `${String(count)} ノード`,
    hintNewMap: "「新規作成」からマップを作れます",
    hintFirstBranch: "Tab で最初の枝を追加",
    hintHelp: "? でキー操作の一覧",
  },

  settings: {
    title: "設定",
    close: "閉じる",
    language: "表示言語",
    theme: "配色",
    themeSystem: "OS テーマ",
    themeLight: "ライト",
    themeDark: "ダーク",
    storage: "保存先",
    storageGitHub: "GitHub",
    storageFolder: "フォルダ",
    changeConnection: "接続先を変更…",
    backToLocal: "このパソコンのフォルダに戻す",
    disconnect: "接続を解除する",
    changeFolder: "フォルダを変更…",
    connectGitHub: "GitHub に接続",
    switchToGitHub: (name: string) => `GitHub に切り替える（${name}）`,
    folderNote: "このフォルダ直下の .md がマップです。",
    export: "テキスト出力",
    openExport: "出力を開く（Ctrl+Shift+C）",
    history: "履歴",
    openHistory: "過去の版を開く",
    shortcuts: "キー操作",
    openShortcuts: "一覧を開く（?）",
  },

  banner: {
    guest: "ゲストモード。まだどこにも保存されていません。",
    chooseStorage: "保存先を選ぶ",
    conflict:
      "このマップは他のアプリからも更新されています。自動保存は止めています（入力は保持しています）。",
    loadExternal: "外部の内容を読み込む",
    keepMine: "こちらの内容で上書きする",
    externallyChanged: "ファイルが外部で更新されました。",
    reload: "読み込み直す",
    quarantined: (id: string, at: string) =>
      `保存できずに退避した内容があります（${id} / ${at}）。`,
    restore: "復元する",
    discard: "破棄する",
  },
};

/** 文言表の形。英語表はこの型を満たさなければならない */
export type Strings = typeof JA;
