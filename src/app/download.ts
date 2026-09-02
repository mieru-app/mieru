/**
 * テキストをファイルとして保存させる（F-35）。
 *
 * 保存先フォルダへの書き込みは `MapStore` の仕事だが、これは「利用者が選んだ
 * どこかへ持ち出す」操作であり、クリップボードへのコピーと同じ側にある。
 * そのため `MapStore` は通さない。
 */
export function downloadText(fileName: string, text: string): void {
  // 末尾に BOM を付けない。Markdown は BOM 付きだと他のツールで先頭行が崩れる
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  // 解放が早すぎると保存が始まらない環境があるため、1周待ってから捨てる
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
