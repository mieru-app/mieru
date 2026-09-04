import { assignPaths, collectLinks } from "../core/parse.js";
import type { MapNode } from "../core/types.js";

/**
 * 木構造の編集操作。
 *
 * すべて純粋関数であり、React にも mind-elixir にも依存しない。
 * 編集ロジックをここへ集めているのは、UI を差し替えても、
 * あるいは UI を自動テストしなくても、操作の正しさを検証できるようにするためである
 * （docs/design/testing.md の「UI は手動試験」という方針の裏返し）。
 *
 * 入力の木は変更しない。常に新しい木を返し、`path` を振り直す。
 */

/** 木の複製。undo のスナップショットにもそのまま使える */
export function cloneTree(node: MapNode): MapNode {
  return {
    ...node,
    links: [...node.links],
    children: node.children.map(cloneTree),
  };
}

function newUid(): string {
  return crypto.randomUUID();
}

/** 空のノードを作る */
export function createNode(label = ""): MapNode {
  return { uid: newUid(), path: "", label, links: [], children: [] };
}

/** 木の中での位置。親が null ならルート */
export interface Location {
  node: MapNode;
  parent: MapNode | null;
  index: number;
}

export function locate(root: MapNode, uid: string): Location | null {
  if (root.uid === uid) return { node: root, parent: null, index: 0 };

  const walk = (parent: MapNode): Location | null => {
    for (const [index, child] of parent.children.entries()) {
      if (child.uid === uid) return { node: child, parent, index };
      const found = walk(child);
      if (found !== null) return found;
    }
    return null;
  };
  return walk(root);
}

/** 深さ優先で全ノードを列挙する（自分を含む） */
export function flatten(root: MapNode): MapNode[] {
  return [root, ...root.children.flatMap(flatten)];
}

/** 編集結果。選択すべきノードを併せて返す */
export interface EditResult {
  root: MapNode;
  selectUid: string;
}

/** 変更なしを表す */
function unchanged(root: MapNode, uid: string): EditResult {
  return { root, selectUid: uid };
}

/** 複製した木の上で操作し、path を振り直して返す */
function edit(
  root: MapNode,
  uid: string,
  action: (location: Location, root: MapNode) => string | null,
): EditResult {
  const next = cloneTree(root);
  const location = locate(next, uid);
  if (location === null) return unchanged(root, uid);

  const selectUid = action(location, next);
  if (selectUid === null) return unchanged(root, uid);

  assignPaths(next);
  return { root: next, selectUid };
}

/** 兄弟を後ろに追加する。ルートには兄弟を作れないので子を追加する */
export function addSibling(root: MapNode, uid: string, label = ""): EditResult {
  return edit(root, uid, ({ parent, index }, next) => {
    const created = createNode(label);
    if (parent === null) {
      next.children.push(created);
    } else {
      parent.children.splice(index + 1, 0, created);
    }
    return created.uid;
  });
}

/** 末尾に子を追加する */
export function addChild(root: MapNode, uid: string, label = ""): EditResult {
  return edit(root, uid, ({ node }) => {
    const created = createNode(label);
    node.children.push(created);
    return created.uid;
  });
}

/**
 * 部分木ごと削除する。
 * 削除後は同じ位置の兄弟、無ければ手前の兄弟、それも無ければ親を選ぶ。
 */
export function removeNode(root: MapNode, uid: string): EditResult {
  return edit(root, uid, ({ parent, index }) => {
    // ルートは削除できない。中心テーマの無いマップは Markdown で表現できないため
    if (parent === null) return null;
    parent.children.splice(index, 1);
    const successor = parent.children[index] ?? parent.children[index - 1];
    return (successor ?? parent).uid;
  });
}

/**
 * ラベルを差し替える。
 *
 * 横断リンクはラベルの中の `[[ ]]` から集めるため、ここで取り直す。
 * 取り直さないと、読み込み時に集めた links がラベルと食い違ったまま残る。
 */
export function setLabel(root: MapNode, uid: string, label: string): EditResult {
  return edit(root, uid, ({ node }) => {
    node.label = label;
    node.links = collectLinks(label);
    return node.uid;
  });
}

/** 絵文字を差し替える。空文字列は「絵文字無し」として扱う（F-15） */
export function setEmoji(root: MapNode, uid: string, emoji: string): EditResult {
  return edit(root, uid, ({ node }) => {
    if (emoji === "") delete node.emoji;
    else node.emoji = emoji;
    return node.uid;
  });
}

/** ノートを差し替える。空文字列は「ノート無し」として扱う */
export function setNote(root: MapNode, uid: string, note: string): EditResult {
  return edit(root, uid, ({ node }) => {
    if (note.trim() === "") delete node.note;
    else node.note = note;
    return node.uid;
  });
}

/**
 * 階層を1つ上げる（Shift+Tab）。自分より後ろの兄弟は自分の子として引き連れる。
 * アウトライナで一般的な挙動であり、これが無いと構造の作り直しが必要になる。
 */
export function outdent(root: MapNode, uid: string): EditResult {
  return edit(root, uid, ({ node, parent }, next) => {
    // 親がルートの場合これ以上は上げられない
    if (parent === null) return null;
    const grandparent = locate(next, parent.uid);
    if (grandparent === null || grandparent.parent === null) return null;

    const index = parent.children.indexOf(node);
    const followers = parent.children.splice(index);
    // 先頭は自分自身。残りは自分の子として引き取る
    node.children.push(...followers.slice(1));
    grandparent.parent.children.splice(grandparent.index + 1, 0, node);
    return node.uid;
  });
}

/** 階層を1つ下げる。直前の兄弟の末子になる */
export function indent(root: MapNode, uid: string): EditResult {
  return edit(root, uid, ({ node, parent, index }) => {
    if (parent === null) return null;
    const previous = parent.children[index - 1];
    if (previous === undefined) return null;

    parent.children.splice(index, 1);
    previous.children.push(node);
    return node.uid;
  });
}


/**
 * 親子を反転する（`Ctrl+Shift+↑`、設計書 7.4）。
 * 選択したノードが親のいた位置へ上がり、親はその先頭の子として下がる。
 *
 * **`outdent` とは別物である。** `outdent` は自分だけを 1 つ上げて後続の兄弟を
 * 引き取るが、こちらは**親と入れ替わる**。親は残りの子（自分の兄弟）を
 * 連れたまま下がるので、反転しても枝の中身は失われない。
 *
 * **親がルートのときは何もしない。** ルートのラベルはマップの題名であり
 * （`parse.ts` の `title: data.title ?? root.label`）、ここで反転させると
 * 構造を組み替えたつもりで題名が変わる。題名の変更は改名で行う。
 */
export function swapWithParent(root: MapNode, uid: string): EditResult {
  return edit(root, uid, ({ node, parent }, next) => {
    if (parent === null) return null;
    const grandparent = locate(next, parent.uid);
    // 親がルート。ここで入れ替えるとルート自体が変わる
    if (grandparent === null || grandparent.parent === null) return null;

    // 親の子から自分を外してから、祖父の下で親と席を入れ替える
    parent.children.splice(parent.children.indexOf(node), 1);
    grandparent.parent.children.splice(grandparent.index, 1, node);

    // 親は自分の先頭の子になる。末尾に付けると、子が多い親では
    // 入れ替えた相手が画面の外へ出てしまい、何が起きたのか分からない
    node.children.unshift(parent);
    return node.uid;
  });
}

/** 兄弟間で順序を入れ替える。@param delta -1 で上、+1 で下 */
export function moveSibling(root: MapNode, uid: string, delta: -1 | 1): EditResult {
  return edit(root, uid, ({ node, parent, index }) => {
    if (parent === null) return null;
    const target = index + delta;
    if (target < 0 || target >= parent.children.length) return null;

    parent.children.splice(index, 1);
    parent.children.splice(target, 0, node);
    return node.uid;
  });
}

/**
 * 落とす位置（2.9-3）。行のどこで離したかに対応する。
 * `inside` は相手の子に、`before` / `after` は相手の兄弟になる。
 */
export type DropPosition = "before" | "after" | "inside";

/**
 * その移動が成立するか。
 *
 * **落とす前に判定できることが要る。** 成立しない相手に印を出してしまうと、
 * 利用者は落とせると思って離し、何も起きない理由が分からない。
 */
export function canDrop(
  root: MapNode,
  uid: string,
  targetUid: string,
  position: DropPosition,
): boolean {
  if (uid === targetUid) return false;

  const from = locate(root, uid);
  // ルートは動かせない。ルートのラベルはマップの題名である
  if (from === null || from.parent === null) return false;

  const to = locate(root, targetUid);
  if (to === null) return false;
  // ルートに兄弟は作れない
  if (position !== "inside" && to.parent === null) return false;

  // 自分の子孫の中へは入れない。木が輪になる
  return !flatten(from.node).some((descendant) => descendant.uid === targetUid);
}

/**
 * 相手を基準に位置を指定して移す（ドラッグ&ドロップ）。
 * 成立しない移動は何もしない。判定は `canDrop` と同じものを使う。
 */
export function moveNode(
  root: MapNode,
  uid: string,
  targetUid: string,
  position: DropPosition,
): EditResult {
  if (!canDrop(root, uid, targetUid, position)) return unchanged(root, uid);

  return edit(root, uid, ({ node, parent }, next) => {
    if (parent === null) return null;
    parent.children.splice(parent.children.indexOf(node), 1);

    // **外してから相手の位置を取り直す。** 先に取った添字は、
    // 自分を外した分だけずれていることがある
    const to = locate(next, targetUid);
    if (to === null) return null;

    if (position === "inside") {
      to.node.children.push(node);
    } else {
      if (to.parent === null) return null;
      to.parent.children.splice(position === "after" ? to.index + 1 : to.index, 0, node);
    }
    return node.uid;
  });
}

/**
 * 別のノードの配下へ移す。キャンバスのドラッグ&ドロップが使う。
 * 位置指定の無い `moveNode` であり、末尾へ足す。
 */
export function moveTo(root: MapNode, uid: string, newParentUid: string): EditResult {
  return moveNode(root, uid, newParentUid, "inside");
}

/**
 * 折り畳みを考慮して画面に見えているノードを上から順に並べる。
 *
 * 折り畳みはセッション中は uid で持つ。構造パスで持つと、ノードを削除した
 * 瞬間に後続のパスがずれ、折り畳み状態が別のノードへ移ってしまうためである。
 * 保存形式（`ViewState.collapsed`）はパスなので、読み書きの境界で変換する。
 */
export function visibleNodes(root: MapNode, collapsedUids: ReadonlySet<string>): MapNode[] {
  const out: MapNode[] = [];
  const walk = (node: MapNode): void => {
    out.push(node);
    if (collapsedUids.has(node.uid)) return;
    for (const child of node.children) walk(child);
  };
  walk(root);
  return out;
}

export type Direction = "up" | "down" | "left" | "right";

/**
 * 方向キーによる移動先を返す。移動できない場合は現在の uid をそのまま返す。
 *
 * キャンバスとアウトラインで同じ意味づけにしている。放射状の表示では
 * 「左＝親」が視覚的に反転する枝もあるが、操作を覚え直さずに済むことを優先した（原則4）。
 */
export function navigate(
  root: MapNode,
  uid: string,
  direction: Direction,
  collapsedUids: ReadonlySet<string>,
): string {
  const visible = visibleNodes(root, collapsedUids);
  const index = visible.findIndex((node) => node.uid === uid);
  if (index === -1) return root.uid;

  if (direction === "up") return visible[index - 1]?.uid ?? uid;
  if (direction === "down") return visible[index + 1]?.uid ?? uid;

  const location = locate(root, uid);
  if (location === null) return uid;
  if (direction === "left") return location.parent?.uid ?? uid;
  // 折り畳み中は右キーで潜らない。展開は Ctrl+/ に一本化する（原則4）
  if (collapsedUids.has(uid)) return uid;
  return location.node.children[0]?.uid ?? uid;
}

/** 折り畳みを切り替える。子を持たないノードは対象外 */
export function toggleCollapsed(
  root: MapNode,
  uid: string,
  collapsedUids: ReadonlySet<string>,
): Set<string> {
  const next = new Set(collapsedUids);
  const location = locate(root, uid);
  if (location === null || location.node.children.length === 0) return next;
  if (!next.delete(uid)) next.add(uid);
  return next;
}

/** 保存形式（構造パス）から編集用（uid）へ変換する */
export function collapsedPathsToUids(root: MapNode, paths: readonly string[]): Set<string> {
  const wanted = new Set(paths);
  return new Set(
    flatten(root)
      .filter((node) => wanted.has(node.path))
      .map((node) => node.uid),
  );
}

/** 編集用（uid）から保存形式（構造パス）へ変換する。ルートは折り畳めないので除く */
export function collapsedUidsToPaths(root: MapNode, collapsedUids: ReadonlySet<string>): string[] {
  return flatten(root)
    .filter((node) => node.path !== "" && collapsedUids.has(node.uid))
    .map((node) => node.path);
}
