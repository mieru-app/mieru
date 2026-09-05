import type { MapIndex } from "../state/search.js";
import { queryIndex, splitTerms } from "../state/search.js";
import { TEMPLATES } from "../state/templates.js";
import type { Strings } from "../state/strings/ja.js";
import type { Command } from "./keymap.js";
import { filterCommands } from "./shortcuts.js";

/**
 * コマンドパレット（`Ctrl+K`）に並べる項目の組み立て。
 *
 * 操作・マップ・下敷きを1つの入力で引けるようにする。3つを別々の入口にすると、
 * 「どこから呼ぶか」を先に思い出さなければならず、名前で呼べる利点が消える。
 *
 * 上下キーで辿れるよう平らな配列にして返す。見出しは `group` として持たせ、
 * 描画側が同じ `group` が続く間だけまとめて出す。
 */

export type PaletteItem =
  | { kind: "command"; key: string; group: string; title: string; hint: string; command: Command }
  | { kind: "map"; key: string; group: string; title: string; hint: string; id: string }
  | { kind: "template"; key: string; group: string; title: string; hint: string; id: string };

/** 一覧に出すマップの上限。多すぎると操作や下敷きが画面の外へ押し出される */
const MAX_MAPS = 8;

export function buildPaletteItems(
  query: string,
  indexes: readonly MapIndex[],
  s: Strings,
): PaletteItem[] {
  const terms = splitTerms(query);

  const commands: PaletteItem[] = filterCommands(query, s).map((item) => ({
    kind: "command",
    key: `command:${item.command}`,
    group: s.keys.paletteGroupCommand,
    title: item.title,
    hint: item.keys,
    command: item.command,
  }));

  const maps: PaletteItem[] = queryIndex(indexes, { query })
    .slice(0, MAX_MAPS)
    .map((hit) => ({
      kind: "map",
      key: `map:${hit.id}`,
      group: s.keys.paletteGroupMap,
      title: hit.title,
      hint: hit.excerpt,
      id: hit.id,
    }));

  // 下敷きは入力が無いうちは出さない。新規作成のたびに使う物ではないため、
  // 開いた直後の一覧を占めると操作とマップが見えにくくなる
  const templates: PaletteItem[] =
    terms.length === 0
      ? []
      : TEMPLATES.filter((template) =>
          terms.every((term) => `${template.name(s)} ${template.description(s)}`.includes(term)),
        ).map((template) => ({
          kind: "template",
          key: `template:${template.id}`,
          group: s.keys.paletteGroupTemplate,
          title: template.name(s),
          hint: template.description(s),
          id: template.id,
        }));

  return [...commands, ...maps, ...templates];
}
