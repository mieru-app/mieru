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
