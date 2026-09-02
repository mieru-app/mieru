/**
 * GitHub Contents API とやり取りするための base64 変換。
 *
 * **`btoa()` に文字列をそのまま渡してはいけない。** Latin-1 しか扱えず、
 * 日本語を含むと `InvalidCharacterError` になる（実測で確認済み）。
 * 本ツールの本文は日本語が前提なので、直接渡せば必ず壊れる。
 * `TextEncoder` でバイト列にし、1バイト1文字の文字列へ移してから渡す。
 *
 * 仕様の正本: docs/design.md 8.7.6
 */

/** 1回の `String.fromCharCode` に渡す最大数。大きなマップで引数上限に触れないため */
const CHUNK = 0x8000;

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

/**
 * API が返す base64 を復号する。
 *
 * 応答の `content` には60文字ごとに改行が入っている。`atob()` は空白を
 * 取り除いてから解釈する仕様（forgiving-base64）なので**そのまま渡して通る**。
 * 実測でも通った。取り除く処理を足したくなったら、それは不要である。
 */
export function decodeBase64(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
