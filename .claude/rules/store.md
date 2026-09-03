---
paths:
  - "src/store/**"
---

# 永続化層の規約

`src/store/` は `MapStore` インターフェースとその実装を持つ。仕様の正本は `docs/design.md` の8章。

## インターフェースの安定性

`MapStore` は UI 層と永続化の唯一の境界であり、Phase 3 のクラウド同期をこの背後で差し替えられることが存在意義である。

- **UI の都合でメソッドを追加しない。** 全実装（`MemoryStore` / `LocalFolderStore` / `GitHubStore`）で意味が通るものだけを置く
- 保存先の制約に由来する値（`autosaveDelayMs` など）はここに置いてよい。UI の都合ではなく保存先の性質だからである
- 特定の実装にしか存在しない機能は、`watch?()` のように任意メソッドとして定義し、未対応の実装は no-op を返す
- インターフェースを変更する場合は、先に `docs/design.md` 8.1 を更新する

## データを失わない

**IMPORTANT: 利用者の入力を失わせる実装を書いてはいけない。** 保存できない状況では、まず IndexedDB へ退避することを最優先とする。

- 保存の原子性は `createWritable()` に委ねる。Chromium は一時ファイルへ書き `close()` で差し替えるため、自前で `.tmp` を作らない（利用者のフォルダにゴミを残さないため）
- 保存失敗時は3回まで指数バックオフで再試行し、それでも失敗したら退避してエラーを表示する
- 競合時は自動マージしない。サーバ版とローカル版の両方を残し、判断を利用者に委ねる
- `write()` は `baseVersion` による楽観ロックを必ず行い、不一致なら `ConflictError` を投げる

## 実装ごとの version の実体

| 実装 | version |
|---|---|
| `MemoryStore` | 連番 |
| `LocalFolderStore` | 本文の内容ハッシュ（`src/store/hash.ts`） |
| `GitHubStore` | Blob SHA。git の blob ハッシュそのもので、内容だけで決まる |
| `S3Store` / `SyncingStore` | S3 の ETag |

## GitHub Contents API の落とし穴（実測。設計書 8.7.4〜8.7.7）

事前検証の記録は `docs/github-api-verification.md`。**どれも実際に叩くまで分からなかった**ので、
`GitHubStore` を触るときは先にここを読むこと。

- **存在しないパスへ `sha` 付きで PUT すると、無視して 201 で作られる。**
  設計書 8.1 の契約表5行目（`MapNotFoundError`）が GitHub 単体では満たせない。
  **保存の前に `If-None-Match` を付けた GET を1回入れて 304/200/404 で分ける**（メモ 4.1）
- **セカンダリ制限「内容を作る要求は 500/時」。** 自動保存の 800ms をそのまま使えない。
  `GitHubStore` の `autosaveDelayMs` が 8 秒なのはこれが理由である
- 409 の応答本文に現在の内容は入らない／GET には60秒のキャッシュが付く／
  `list()` は 1+N リクエストになる／`btoa()` は日本語で例外になる（`base64.ts` を使う）
- **`GitHubStore` は `watch()` を持たない**（設計書 8.7.7）。競合検出は `write()` が担う

**保存先の選択（`backend-preference.ts`）と資格情報は別に持つ。**
一緒にすると、保存先を切り替えるたびにトークンを入れ直させることになる。

## 資格情報

**トークン文字列を持つのは `src/store/github-auth.ts` だけにする。**
画面やログに出す必要が生じたら `describeCredential()` を使う。
資格情報オブジェクトをそのまま `console.log` へ渡すとトークンが漏れる。

保管先は IndexedDB で、**平文である**。暗号化しないのは、合言葉を毎回入力させない限り
復号鍵も同じブラウザに置くことになり、守っているように見えて守っていない実装になるため。
代わりに権限（1リポジトリ・Contents のみ）と期間を絞って被害の上限を抑える。
根拠と承知している危険は設計書 8.7.2。

## テスト

`MapStore` の契約（楽観ロック、`ConflictError`、存在しない id の扱い）は `MemoryStore` を使って全メソッド網羅でテストする。実装を追加したら同じ契約テストを流用して通す。

ブラウザ API に依存する実装も未検証にしない。`src/store/__tests__/fake-fs.ts`（File System Access API の偽物）と `fake-indexeddb` を使い、**権限失効・書き込み失敗・外部からの書き換え**を注入して検証する。とりわけ退避（`QuarantineSink`）はデータを失わないための最後の砦であり、必ず動作を確認する。
