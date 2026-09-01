import { assignPaths } from "../../core/parse.js";
import type { MapNode } from "../../core/types.js";
import { flatten } from "../../state/tree.js";

/**
 * mind-elixir との相互変換。
 *
 * **本ツールのモデルが正であり、mind-elixir の状態は描画の都合である。**
 * 個々の操作を写し取るのではなく木ごと変換して受け渡す。こうしておくと
 * mind-elixir 側の操作が増えても追随の必要がなく、将来ライブラリを
 * 差し替えるときもここだけで済む（設計書 12.1 のロックイン対策）。
 *
 * ここは純粋な変換のみを担い、mind-elixir を import しない。
 * 型は `NodeObj` のうち本ツールが使う部分を構造的に写してある。
 */

/** mind-elixir のノードのうち、本ツールが読み書きする範囲 */
export interface MindElixirNode {
  id: string;
  topic: string;
  children?: MindElixirNode[];
  expanded?: boolean;
  /** 絵文字。mind-elixir はここを装飾として描画する */
  icons?: string[];
  note?: string;
}

export interface MindElixirData {
  nodeData: MindElixirNode;
}

/** mind-elixir は空の topic を扱えないため、表示上の代替を置く */
const EMPTY_TOPIC = "　";

export function toMindElixir(root: MapNode, collapsedUids: ReadonlySet<string>): MindElixirData {
  const convert = (node: MapNode): MindElixirNode => {
    const converted: MindElixirNode = {
      id: node.uid,
      topic: node.label === "" ? EMPTY_TOPIC : node.label,
      expanded: !collapsedUids.has(node.uid),
      children: node.children.map(convert),
    };
    if (node.emoji !== undefined) converted.icons = [node.emoji];
    if (node.note !== undefined) converted.note = node.note;
    return converted;
  };
  return { nodeData: convert(root) };
}

/**
 * mind-elixir 側の木を本ツールのモデルへ戻す。
 *
 * 横断リンク（`[[ ]]` から集めた `links`）は mind-elixir が持たないため、
 * 変換前の木から uid で引いて引き継ぐ。これを怠ると、
 * キャンバスで1回操作しただけで横断リンクが失われる。
 */
export function fromMindElixir(
  data: MindElixirData,
  previous: MapNode,
): { root: MapNode; collapsedUids: Set<string> } {
  const before = new Map(flatten(previous).map((node) => [node.uid, node]));
  const collapsedUids = new Set<string>();

  const convert = (node: MindElixirNode): MapNode => {
    const carried = before.get(node.id);
    if (node.expanded === false) collapsedUids.add(node.id);

    const emoji = node.icons?.[0] ?? carried?.emoji;
    const note = node.note ?? carried?.note;

    const converted: MapNode = {
      uid: node.id,
      path: "",
      label: node.topic === EMPTY_TOPIC ? "" : node.topic,
      links: carried === undefined ? [] : [...carried.links],
      children: (node.children ?? []).map(convert),
    };
    if (emoji !== undefined && emoji !== "") converted.emoji = emoji;
    if (note !== undefined && note !== "") converted.note = note;
    return converted;
  };

  const root = convert(data.nodeData);
  assignPaths(root);
  return { root, collapsedUids };
}
