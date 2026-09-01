/**
 * 内容ハッシュ。`LocalFolderStore` の version の実体である。
 *
 * 更新日時を version に使うと、分解能の粗いファイルシステム（FAT32/exFAT は2秒）で
 * 外部編集を検出できず黙って上書きしてしまう。内容そのものから版を作れば
 * その穴がなくなり、「同じ内容で保存し直された」場合に競合扱いしない利点もある。
 *
 * 暗号学的用途には使わない。変更検出のためだけのものである。
 *
 * 仕様の正本: docs/design.md 8.2
 */

/** FNV-1a を異なる定数で2本走らせ、64bit 相当の16進文字列にする */
export function contentHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;

  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x85ebca6b);
  }

  // 長さも混ぜる。末尾に NUL 相当が並ぶ入力での衝突を避けるため
  h1 = Math.imul(h1 ^ text.length, 0x01000193);
  h2 = Math.imul(h2 ^ text.length, 0x85ebca6b);

  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}
