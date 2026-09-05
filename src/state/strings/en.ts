import type { Strings } from "./ja.js";

/**
 * 英語の文言表（2.12）。
 *
 * **型が `Strings` なので、鍵の抜けも余りも型検査で落ちる。**
 * 日本語表に鍵を足したら、ここも足さなければビルドが通らない。
 *
 * **直訳しない。** 短い字の方が押しボタンに収まり、英語圏では
 * 命令形の1語が普通である（「テキスト出力」→ `Export`）。
 */

export const EN: Strings = {
  locale: "en-US",

  viewMode: {
    canvas: "Canvas",
    outline: "Outline",
    source: ".md",
    canvasShort: "Map",
    outlineShort: "List",
    sourceShort: "MD",
  },

  toolbar: {
    sidebar: "Toggle sidebar",
    home: "Back to home",
    viewSwitch: "Switch view",
    export: "Export",
    exportHint: "Ctrl+Shift+C copies it straight away",
    history: "History",
    historyHint: "Look at earlier versions and go back",
    newMap: "New map",
    shortcuts: "Help",
    settings: "Settings",
  },

  status: {
    empty: "No map open",
    saved: (time: string) => `Saved ${time}`,
    dirty: "Unsaved changes",
    saving: "Saving…",
    conflict: "Changed outside Mieru (your unsaved edits are kept)",
    failed: (reason: string) => `Cannot save: ${reason}`,
    nodes: (count: number) => `${String(count)} ${count === 1 ? "node" : "nodes"}`,
    hintNewMap: "Start one from “New map”",
    hintFirstBranch: "Press Tab to add the first branch",
    hintHelp: "Press ? for the list of keys",
  },

  settings: {
    title: "Settings",
    close: "Close",
    language: "Language",
    theme: "Colours",
    themeSystem: "OS theme",
    themeLight: "Light",
    themeDark: "Dark",
    storage: "Where maps are saved",
    storageGitHub: "GitHub",
    storageFolder: "Folder",
    changeConnection: "Change the connection…",
    backToLocal: "Go back to a folder on this computer",
    disconnect: "Disconnect",
    changeFolder: "Change folder…",
    connectGitHub: "Connect to GitHub",
    switchToGitHub: (name: string) => `Switch to GitHub (${name})`,
    folderNote: "Every .md file directly in this folder is a map.",
    export: "Export",
    openExport: "Open the export (Ctrl+Shift+C)",
    history: "History",
    openHistory: "Open earlier versions",
    shortcuts: "Keys",
    openShortcuts: "Open the list (?)",
  },

  sidebar: {
    maps: "Maps",
    search: "Search every map",
    filterByTag: "Filter by tag",
    noMaps: "No maps yet.",
    noHits: "Nothing matches.",
    newTitle: "New title",
    rename: "Rename",
    renameOf: (title: string) => `Rename ${title}`,
    remove: "Delete",
    removeOf: (title: string) => `Delete ${title}`,
    hitTitle: "Title",
    hitLabel: "Node",
    hitNote: "Note",
    newMap: "+ New map",
  },

  note: {
    untitled: "(untitled node)",
    read: "Preview",
    write: "Edit",
    pickEmoji: "Pick an emoji",
    clearEmoji: "Remove the emoji",
    close: "Close the note",
    body: "Note",
    links: "Links",
    unresolved: "no target",
    pickLink: "Pick a node to link…",
  },

  history: {
    title: "History",
    close: "Close",
    unavailable: "Pick where maps are saved and earlier versions will show up here.",
    loading: "Loading…",
    empty: "No versions yet. They appear once you edit and it saves.",
    latest: "latest",
    bytes: (size: number) => `${String(size)} byte`,
    summary: (added: number, removed: number) =>
      `+${String(added)} -${String(removed)} lines since this version`,
    diff: "What changed between this version and now",
    restore: "Restore",
  },

  export: {
    title: "Export",
    close: "Close",
    format: "Format",
    scope: "Scope",
    heading: "Headings",
    bullet: "Bullets",
    whole: "Whole map",
    selection: "Selected branch",
    placeholder: "Open a map and the result shows up here.",
    target: "Scope",
    copy: "Copy",
    download: "Save as .md",
  },

  source: {
    body: "The Markdown that gets saved",
    size: (lines: number, bytes: number) => `${String(lines)} lines / ${String(bytes)} byte`,
  },

  outline: {
    title: "Outline",
    drag: "Drag to move it in the tree",
    expand: "Expand",
    collapse: "Collapse",
    emptyLabel: "(empty)",
    hasNote: "Has a note",
  },

  canvas: {
    zoom: "Zoom",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    fit: "Fit the whole map",
  },

  start: {
    loading: "Loading…",
    permissionTitle: "Let Mieru into the folder again",
    permissionBody: (folder: string) =>
      `Your browser needs you to confirm access to “${folder}” one more time.`,
    grant: "Allow access",
    pickAnother: "Pick a different folder",
    connectTitle: "Connect to GitHub",
    connectBody: "Maps are saved as Markdown in your own repository.",
    tagline: "A mind map that is already Markdown.",
    guest: "Try guest mode",
    guestNote: "Nothing is saved. You can pick a place later.",
    storage: "Where maps are saved",
    localFolder: "A local folder",
    localScope: "Only the .md files directly inside the folder you pick",
    pickFolder: "Pick a folder",
    localUnsupported: "Needs desktop Chrome or Edge.",
    githubRepo: "A GitHub repository",
    githubNeedsToken: "Needs a token",
    connect: "Connect",
  },

  home: {
    create: "New map",
    fileName: "File name",
    template: "Template",
    submit: "Create",
    importPrompt: "Prompt for bringing in an AI session",
  },

  crash: {
    safe: "Everything already saved is untouched.",
    reload: "Reload",
    title: "The screen stopped drawing",
    lost: "Your work in progress could not be recovered.",
    recoverable: "Use “Copy the draft” below to get the open map out.",
    copied: "Copied",
    copyDraft: "Copy the draft",
    copyError: "Copy the error",
    noStack: "(no stack)",
  },

  editBar: {
    title: "Edit",
    addChild: "+Child",
    addChildTitle: "Add a child",
    addSibling: "+Sibling",
    addSiblingTitle: "Add a sibling",
    rename: "Rename",
    renameTitle: "Rename the selected node",
    remove: "Delete",
    removeTitle: "Delete it and everything under it",
    undoTitle: "Undo",
  },

  guide: {
    title: "Grow branches from the centre",
    addChild: "adds a child",
    addSibling: "adds a sibling",
    rename: "renames the selected node",
    more: "opens the full list of keys.",
  },

  toast: {
    restored: "Restored that version. Ctrl+Z undoes it",
    promptCopied: "Prompt copied",
    markdownCopied: "Markdown copied",
    copyFailed: "Could not copy to the clipboard",
    confirmDelete: (title: string) => `Delete “${title}”? This cannot be undone.`,
    sidebarWidth: "Sidebar width",
    panelWidth: "Panel width",
  },

  keys: {
    groupCreate: "Grow the tree",
    groupMove: "Move and select",
    groupUndo: "Undo and views",
    groupFind: "Find maps",
    groupShare: "Hand off and save",

    addChild: "Add a child",
    addSibling: "Add a sibling",
    outdent: "Move it up one level",
    beginEdit: "Rename the selected node",
    remove: "Delete it and everything under it",
    moveUpDown: "Move to the previous or next node",
    moveLeftRight: "Move to the parent or first child",
    reorder: "Reorder among siblings",
    swapWithParent: "Swap with the parent (put this node in its place)",
    toggleCollapse: "Collapse or expand",
    undo: "Undo",
    redo: "Redo",
    toggleMode: "Cycle the view (canvas → outline → Markdown)",
    toggleSidebar: "Show or hide the sidebar",
    focusSearchLong: "Search across every map",
    focusSearch: "Search every map",
    palette: "Command palette (call actions and maps by name)",
    copyForAiLong: "Copy as text (select a branch for just that part)",
    copyForAi: "Copy as text (headings)",
    saveNowLong: "Save right now (it saves on its own anyway)",
    saveNow: "Save right now",
    toggleHelpLong: "Show or hide this list",
    toggleHelp: "Open the list of keys",
    toggleExport: "Open the export (pick format and scope)",
    toggleHistory: "Open the history (look at earlier versions)",

    paletteGroupCommand: "Actions",
    paletteGroupMap: "Open a map",
    paletteGroupTemplate: "New map from this template",
  },

  github: {
    repo: "Repository",
    repoPlaceholder: "owner/repo or https://github.com/owner/repo",
    token: "Access token",
    howTo: "How to make a token",
    openTokenPage: "Open GitHub’s token page",
    advanced: "Choose where in the repo (optional)",
    directory: "Folder inside the repository",
    directoryPlaceholder: "Empty means the repository root",
    branch: "Branch",
    branchPlaceholder: "Empty means the default branch",
    remember: "Remember on this device",
    verifying: "Checking…",
    connect: "Connect",
    cancel: "Cancel",
  },

  palette: {
    title: "Command palette",
    placeholder: "Type an action or a map name",
    empty: "Nothing matches.",
  },

  banner: {
    guest: "Guest mode. Nothing is saved anywhere yet.",
    chooseStorage: "Choose where to save",
    conflict:
      "Another app has changed this map too. Autosave is paused; nothing you typed has been lost.",
    loadExternal: "Load the other version",
    keepMine: "Overwrite with mine",
    externallyChanged: "This file changed outside Mieru.",
    reload: "Reload it",
    quarantined: (id: string, at: string) =>
      `Some content could not be saved and was set aside (${id} / ${at}).`,
    restore: "Restore",
    discard: "Discard",
  },
};
