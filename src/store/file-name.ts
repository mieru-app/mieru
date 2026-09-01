/**
 * マップ id（＝ファイル名）の規則。
 *
 * 判定と生成を1か所に置いている。別々に書くと、
 * 「作れるが保存できない名前」が生まれてデータを失う経路になるため。
 *
 * 仕様の正本: docs/design.md 8.3
 */

/** ファイル名に使えない文字。パス区切りと Windows の予約文字 */
const FORBIDDEN_CHARS = ["<", ">", ":", '"', "|", "?", "*", "/", "\\"];

/** 制御文字か。正規表現に直接書くとソースへ生のバイトが入るため符号位置で判定する */
function isControl(character: string): boolean {
  return (character.codePointAt(0) ?? 0) < 0x20;
}

/**
 * 保存先の id として妥当か。
 * パス区切りを弾くのは、選んだフォルダの外へ書き出させないためである。
 */
export function isValidMapId(id: string): boolean {
  if (!id.endsWith(".md") || id.length <= 3) return false;
  if (id.startsWith(".")) return false;
  for (const character of id) {
    if (isControl(character) || FORBIDDEN_CHARS.includes(character)) return false;
  }
  return true;
}

/** ファイル名の長さの上限。拡張子と重複回避の連番の分を残す */
const MAX_BASE_LENGTH = 60;

/** 表題をファイル名の基底部分へ変換する。空になる場合は「無題」 */
export function toFileNameBase(title: string): string {
  const cleaned = [...title]
    .map((character) =>
      isControl(character) || FORBIDDEN_CHARS.includes(character) ? "-" : character,
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_BASE_LENGTH)
    .trim()
    // 先頭のドットは隠しファイルになるため落とす
    .replace(/^\.+/, "")
    .trim();
  return cleaned === "" ? "無題" : cleaned;
}

/** 表題から、既存と重ならないファイル名を作る */
export function fileNameFor(title: string, existing: readonly string[]): string {
  const base = toFileNameBase(title);
  const taken = new Set(existing);
  if (!taken.has(`${base}.md`)) return `${base}.md`;

  for (let index = 2; ; index += 1) {
    const candidate = `${base} ${index}.md`;
    if (!taken.has(candidate)) return candidate;
  }
}
