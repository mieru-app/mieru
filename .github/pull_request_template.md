<!--
日本語で書いていただいて構いません。英語でも構いません。

説明が要らないほど小さい変更なら、下の見出しは消してください。
**埋めることが目的の欄にしないでください。**
-->

## What this changes

<!-- 何を変えたか。1〜2行で。 -->

## Why

<!--
**なぜ必要か。** ここがいちばん重要です。
関連する Issue があれば `Closes #123` と書いてください。
-->

## How it was checked

<!--
実際に確かめたことだけを書いてください。**「動くはず」は書かないでください。**

`src/app/` と `src/views/` は自動テストを持ちません。
そこを触った場合は、ブラウザで何をどう操作して確かめたかを書いてください。
-->

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] 描画層を触った場合、`npm run dev` で実際に操作して確かめた

## Before you send

- [ ] **すべてのコミットに `Signed-off-by:` がある**（`git commit -s`。無いと CI が落ちます）
- [ ] 設計に影響する変更なら、`docs/design/` も同じ Pull Request で直した
- [ ] 新しい依存を足した場合、その理由を上に書いた

<!--
不変条件が5つあります（docs/design/principles.md）。
Markdown が保存形式であること、表示状態を `mm:` 配下にのみ書くこと、
UI 層は MapStore 経由でのみ永続化すること、mind-elixir の import は
src/views/Canvas/ のみ、ラウンドトリップの強保証を壊さないこと。

これらに触れる変更は、実装より先に docs/design/ を直して合意を取ってください。
-->
