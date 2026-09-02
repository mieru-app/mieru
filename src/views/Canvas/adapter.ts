import { assignPaths } from "../../core/parse.js";
import type { MapNode, ViewState } from "../../core/types.js";
import { branchColors } from "../../state/palette.js";
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
  /** 枝線の色。第1階層にだけ付ける（F-24） */
  branchColor?: string;
}

/** 横断リンクの矢印（F-17）。mind-elixir の Arrow のうち本ツールが使う範囲 */
export interface MindElixirArrow {
  id: string;
  label: string;
  from: string;
  to: string;
}

export interface MindElixirData {
  nodeData: MindElixirNode;
  arrows?: MindElixirArrow[];
}

/** mind-elixir は空の topic を扱えないため、表示上の代替を置く */
const EMPTY_TOPIC = "　";

/**
 * 横断リンクを矢印へ変換する（F-17）。
 *
 * リンク先はラベル文字列で書かれているため、同じラベルのノードを引く。
 * 同名が複数あれば最初の1つに繋ぐ。解決できないリンクは矢印を作らない
 * （書きかけの `[[` に矢印が出ると、書いている最中に画面が騒がしくなる）。
 */
export function toArrows(root: MapNode): MindElixirArrow[] {
  const nodes = flatten(root);
  const byLabel = new Map<string, string>();
  for (const node of nodes) {
    if (node.label !== "" && !byLabel.has(node.label)) byLabel.set(node.label, node.uid);
  }

  const arrows: MindElixirArrow[] = [];
  for (const node of nodes) {
    for (const link of node.links) {
      const to = byLabel.get(link);
      // 自分自身へのリンクは描かない
      if (to === undefined || to === node.uid) continue;
      arrows.push({ id: `${node.uid}->${to}`, label: "", from: node.uid, to });
    }
  }
  return arrows;
}

export function toMindElixir(
  root: MapNode,
  collapsedUids: ReadonlySet<string>,
  colors: ViewState["colors"] = "auto",
): MindElixirData {
  const palette = branchColors(colors, root.children.length);

  const convert = (node: MapNode, branchIndex: number | null): MindElixirNode => {
    const converted: MindElixirNode = {
      id: node.uid,
      topic: node.label === "" ? EMPTY_TOPIC : node.label,
      expanded: !collapsedUids.has(node.uid),
      children: node.children.map((child, index) =>
        convert(child, branchIndex === null ? index : branchIndex),
      ),
    };
    if (node.emoji !== undefined) converted.icons = [node.emoji];
    if (node.note !== undefined) converted.note = node.note;

    const color = branchIndex === null ? undefined : palette[branchIndex];
    if (color !== undefined && color !== "") converted.branchColor = color;
    return converted;
  };

  return { nodeData: convert(root, null), arrows: toArrows(root) };
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
