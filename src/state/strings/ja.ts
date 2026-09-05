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

  sidebar: {
    maps: "マップ",
    search: "全マップを検索",
    filterByTag: "タグで絞り込む",
    noMaps: "まだマップがありません。",
    noHits: "条件に合うマップはありません。",
    newTitle: "新しい表題",
    rename: "名前を変える",
    renameOf: (title: string) => `${title} の名前を変える`,
    remove: "削除する",
    removeOf: (title: string) => `${title} を削除する`,
    hitTitle: "表題",
    hitLabel: "ノード",
    hitNote: "ノート",
    newMap: "＋ 新規作成",
  },

  note: {
    untitled: "（無題のノード）",
    read: "Preview",
    write: "書く",
    pickEmoji: "絵文字を選ぶ",
    clearEmoji: "絵文字を外す",
    close: "ノートを閉じる",
    body: "ノード説明",
    links: "横断リンク",
    unresolved: "宛先なし",
    pickLink: "つなぐノードを選ぶ…",
  },

  history: {
    title: "履歴",
    close: "閉じる",
    unavailable: "保存先を選ぶと、過去の版がここに残ります。",
    loading: "読み込んでいます…",
    empty: "まだ版がありません。編集して保存されると、ここに残ります。",
    latest: "latest",
    bytes: (size: number) => `${String(size)} byte`,
    summary: (added: number, removed: number) =>
      `この版から今までに +${String(added)} -${String(removed)} 行`,
    diff: "この版と今の内容の違い",
    restore: "復元",
  },

  export: {
    title: "テキスト出力",
    close: "閉じる",
    format: "形式",
    scope: "範囲",
    heading: "見出し",
    bullet: "箇条書き",
    whole: "全体",
    selection: "選択部分",
    placeholder: "マップを開くと、ここに出力結果が出ます。",
    target: "対象",
    copy: "コピー",
    download: ".md で保存",
  },

  source: {
    body: "保存される Markdown",
    size: (lines: number, bytes: number) => `${String(lines)} 行 / ${String(bytes)} byte`,
  },

  outline: {
    title: "アウトライン",
    drag: "掴んで階層を変える",
    expand: "展開",
    collapse: "折り畳み",
    emptyLabel: "（空）",
    hasNote: "ノートあり",
  },

  canvas: {
    zoom: "拡大縮小",
    zoomIn: "拡大",
    zoomOut: "縮小",
    fit: "全体を表示",
  },

  start: {
    loading: "読み込み中…",
    permissionTitle: "フォルダへのアクセスを許可してください",
    permissionBody: (folder: string) =>
      `「${folder}」を開くには、ブラウザの制約でもう一度だけ許可が要ります。`,
    grant: "アクセスを許可する",
    pickAnother: "別のフォルダを選ぶ",
    connectTitle: "GitHub に接続",
    connectBody: "あなたのリポジトリの Markdown として保存されます。",
    tagline: "マインドマップで広げた考えが、そのまま Markdown。",
    guest: "ゲストモードで試す",
    guestNote: "保存されません。あとから保存先を選べます。",
    storage: "保存先",
    localFolder: "ローカルフォルダ",
    localScope: "選んだフォルダの直下にある .md だけを読み書きします",
    pickFolder: "フォルダを選ぶ",
    localUnsupported: "デスクトップ版の Chrome か Edge が要ります。",
    githubRepo: "GitHub リポジトリ",
    githubNeedsToken: "トークンが必要です",
    connect: "接続する",
  },

  home: {
    create: "新規作成",
    fileName: "ファイル名",
    template: "テンプレート",
    submit: "作成",
    importPrompt: "既存の AI セッションの取り込みフォーマット",
  },

  crash: {
    safe: "保存済みの内容は失われていません。",
    reload: "読み込み直す",
    title: "画面の描画が止まりました",
    lost: "書きかけを取り出すことはできませんでした。",
    recoverable: "下の「書きかけを写す」で、いま開いているマップを取り出せます。",
    copied: "写しました",
    copyDraft: "書きかけを写す",
    copyError: "エラーを写す",
    noStack: "(スタックなし)",
  },

  editBar: {
    title: "編集",
    addChild: "＋子",
    addChildTitle: "子を追加する",
    addSibling: "＋兄弟",
    addSiblingTitle: "兄弟を追加する",
    rename: "名前",
    renameTitle: "選択中のノードを書き換える",
    remove: "削除",
    removeTitle: "部分木ごと削除する",
    undoTitle: "元に戻す",
  },

  guide: {
    title: "中心テーマから枝を伸ばします",
    addChild: "子を追加する",
    addSibling: "兄弟を追加する",
    rename: "選択中のノードを書き換える",
    more: "でキー操作の一覧を開けます。",
  },

  toast: {
    restored: "この版に戻しました。Ctrl+Z で取り消せます",
    promptCopied: "取り込み指示をコピーしました",
    markdownCopied: "Markdown をコピーしました",
    copyFailed: "クリップボードへコピーできませんでした",
    confirmDelete: (title: string) => `「${title}」を削除します。元に戻せません。`,
    sidebarWidth: "一覧の幅",
    panelWidth: "欄の幅",
  },

  keys: {
    groupCreate: "枝を作る",
    groupMove: "動かす・選ぶ",
    groupUndo: "元に戻す・表示",
    groupFind: "マップを探す",
    groupShare: "AI へ渡す・保存",

    addChild: "子を追加する",
    addSibling: "兄弟を追加する",
    outdent: "階層を1つ上げる",
    beginEdit: "選択中のノードを書き換える",
    remove: "部分木ごと削除する",
    moveUpDown: "前後のノードへ移動する",
    moveLeftRight: "親・最初の子へ移動する",
    reorder: "兄弟の順序を入れ替える",
    swapWithParent: "親子を反転する（選択中のノードを親の位置へ）",
    toggleCollapse: "折り畳む・展開する",
    undo: "元に戻す",
    redo: "やり直す",
    toggleMode: "表示を順に切り替える（キャンバス → アウトライン → Markdown）",
    toggleSidebar: "サイドバーを開閉する",
    focusSearchLong: "全マップを横断して検索する",
    focusSearch: "全マップを検索する",
    palette: "コマンドパレット（操作とマップを名前で呼ぶ）",
    copyForAiLong: "テキストをコピー（枝を選ぶとその部分だけ）",
    copyForAi: "テキストをコピーする（見出し形式）",
    saveNowLong: "すぐ保存する（通常は自動保存）",
    saveNow: "すぐ保存する",
    toggleHelpLong: "この一覧を開閉する",
    toggleHelp: "キー操作の一覧を開く",
    toggleExport: "テキスト出力を開く（形式と範囲を選ぶ）",
    toggleHistory: "履歴を開く（過去の版を見て戻す）",

    paletteGroupCommand: "操作",
    paletteGroupMap: "マップを開く",
    paletteGroupTemplate: "この下敷きで新規作成",
  },

  github: {
    repo: "リポジトリ",
    repoPlaceholder: "owner/repo または https://github.com/owner/repo",
    token: "アクセストークン",
    howTo: "トークンの作り方",
    openTokenPage: "GitHub のトークン作成画面を開く",
    advanced: "置き場所を指定（省略可）",
    directory: "リポジトリ内のフォルダ",
    directoryPlaceholder: "空ならリポジトリ直下",
    branch: "ブランチ",
    branchPlaceholder: "空なら既定のブランチ",
    remember: "この端末に記憶する",
    verifying: "確認しています…",
    connect: "接続する",
    cancel: "やめる",
  },

  palette: {
    title: "コマンドパレット",
    placeholder: "操作かマップの名前を入力",
    empty: "一致するものがありません。",
  },

  error: {
    guestAdopt: (why: string) => `ゲストの内容を引き継げませんでした: ${why}`,
    noGitHub: "GitHub の接続情報がありません。",
    folderDenied: "フォルダへのアクセスが許可されませんでした。",
    listMaps: (why: string) => `マップ一覧を読めませんでした: ${why}`,
    openMap: (why: string) => `マップを開けませんでした: ${why}`,
    createMap: (why: string) => `マップを作成できませんでした: ${why}`,
    renameMap: (why: string) => `マップの名前を変えられませんでした: ${why}`,
    deleteMap: (why: string) => `マップを削除できませんでした: ${why}`,
    loadHistory: (why: string) => `履歴を読み込めませんでした: ${why}`,
    loadVersion: (why: string) => `この版を読み込めませんでした: ${why}`,
    fileRemoved: "保存先のファイルが外部で削除されました。編集を続けると作り直します。",
  },

  template: {
    blank: "デフォルト",
    blankHint: "中心テーマだけ",
    swot: "SWOT",
    swotHint: "強み・弱み・機会・脅威",
    swotBody: "# ひな形\n\n- 強み\n- 弱み\n- 機会\n- 脅威\n",
    minutes: "議事録",
    minutesHint: "決まったこと・宿題・論点",
    minutesBody: "# ひな形\n\n- 決まったこと\n- 宿題\n- 論点\n- 次回\n",
    weekly: "週次振返り",
    weeklyHint: "やったこと・気づき・次の一手",
    weeklyBody: "# ひな形\n\n- やったこと\n- 気づき\n- うまくいかなかったこと\n- 次の一手\n",
  },

  scope: {
    untitled: "無題",
    untitledBranch: "無題の枝",
    whole: "全体",
    copied: (what: string) => `${what}を Markdown でコピーしました`,
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
