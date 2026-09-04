# 永続化（MapStore の契約）

**`MapStore` の契約が Phase 移行のコストを決める。** 保存先が増えてもここだけで閉じる。
**楽観ロックの挙動が実装ごとにずれると、競合時にデータを失う。**

GitHub 固有の事情は [GitHubStore](./github-store.md)、履歴は [履歴](./history.md)、
見送った AWS 同期は [AWS 同期](../human-review/aws-sync.md)。
実装は `src/store/`、細則は `.claude/rules/store.md`。

**節番号は分割前のものを残してある。** コード中のコメントが
「設計書 8.6」のように章番号で参照しているため（49 ファイル・92 箇所）。
対応は [設計の索引](../design.md)。

---

## 8.1 MapStore インターフェース

**原則3の実装。これが Phase 3 への移行コストを決定づける最重要の設計要素である。**

```typescript
interface MapStore {
  /** マップ一覧を取得する。本文は読み込まない（軽量） */
  list(): Promise<MapMeta[]>;

  /** マップ本文を取得する */
  read(id: string): Promise<{ md: string; version: string }>;

  /**
   * マップを保存する。
   * baseVersion は読み込んだ時点の version。
   * 不一致なら ConflictError を投げる（楽観ロック）。
   * 戻り値は保存後の新しい version。
   */
  write(id: string, md: string, baseVersion: string | null): Promise<string>;

  /** マップを削除する */
  remove(id: string): Promise<void>;

  /** 外部変更の監視（対応可能な実装のみ）。未対応なら no-op を返す */
  watch?(onChange: (id: string) => void): () => void;

  /**
   * 自動保存の推奨待機時間（ミリ秒）。省略時は src/state/ の既定（800ms）を使う。
   * 保存先ごとに書き込み頻度の上限が違うために要る（8.7.5）。
   */
  readonly autosaveDelayMs?: number;
}

class ConflictError extends Error {
  constructor(
    readonly id: string,
    readonly serverVersion: string,
    readonly serverMd: string,
  ) {
    super("Conflict on " + id);
  }
}
```

**UI層はこのインターフェースのみに依存する。** 実装の差し替えでフェーズ移行が完結する。

#### write() の契約（全実装が満たすこと）

| baseVersion | 保存先の状態 | 挙動 |
|---|---|---|
| `null` | 存在しない | 新規作成する |
| `null` | 存在する | `ConflictError`（他所で作成済み） |
| 版を指定 | 版が一致 | 上書きする |
| 版を指定 | 版が不一致 | `ConflictError` |
| 版を指定 | 存在しない | `MapNotFoundError`（他所で削除済み） |

この契約は共通の契約テスト（`src/store/__tests__/contract.ts`）として実装済みであり、`LocalFolderStore` / `S3Store` / `SyncingStore` を追加する際は同じスイートを流用して通すこと。楽観ロックの挙動が実装ごとにずれると、競合時にデータを失う。

## 8.2 実装バリエーション

| 実装 | Phase | version の実体 | 備考 |
|---|---|---|---|
| `MemoryStore` | 0 | 連番 | テスト用 |
| `LocalFolderStore` | 1 | 本文の内容ハッシュ | File System Access API |
| `GitHubStore` | 2.6 | Blob SHA | Contents API。保存はコミットになる（8.7） |
| `S3Store` | 3 | S3 の ETag | ブラウザから直接S3を操作（見送り） |
| `SyncingStore` | 3 | S3 の ETag | 上2つを内包。IndexedDBをキャッシュとして使用 |

> **`LocalFolderStore` の version に更新日時を使わない理由（Phase 1 で変更）:** FAT32 / exFAT は更新日時の分解能が2秒あり、その窓に収まった外部編集を検出できずに黙って上書きしてしまう。`list()` も `read()` も frontmatter の取得のために本文を読むため、内容そのものをハッシュしても追加コストはほぼ無い。副次的な利点として、外部から**同じ内容**で書き直された場合に競合として扱わずに済む。ハッシュは変更検出専用であり暗号学的用途には使わない（`src/store/hash.ts`）。

## 8.3 LocalFolderStore（Phase 1）

```
利用者がフォルダを選択
  → FileSystemDirectoryHandle を取得
  → ハンドルを IndexedDB に保存（次回起動時に再利用）
  → 起動時に queryPermission() で権限を確認
     ├ granted → そのまま利用
     └ prompt  → 「フォルダへのアクセスを許可」ボタンを1回押してもらう
```

| 項目 | 仕様 |
|---|---|
| 対象ファイル | フォルダ直下の `*.md`（サブフォルダは Phase 2 で対応） |
| ID | ファイル名（拡張子含む） |
| 保存方式 | `createWritable()` に委ねる。Chromium は一時ファイルへ書き `close()` で差し替えるため、中断しても元ファイルは無傷で残る |
| 保存失敗時 | 指数バックオフで3回試行。権限失効は再試行せず即座に退避へ回す |
| 外部変更検知 | 30秒ごと、およびウィンドウフォーカス復帰時に更新日時を確認 |
| 権限失効時 | 編集内容をIndexedDBに退避し、再許可後に書き戻す |

**制約: File System Access API は Chromium系デスクトップブラウザ（Edge / Chrome / Opera）のみで動作する。** Firefox・Safari・全モバイルブラウザは非対応。Phase 1 の対応ブラウザがEdge/Chromeに限られるのはこのためであり、Phase 3 完了後にこの制約は解消される。

**改名（F-03）はファイル名の変更を伴う。** `MapStore` に「改名」は無く、
`write(新しい id)` と `remove(古い id)` の2手で行う（`src/state/workspace.ts` の `renameMap`）。
**必ず書いてから消す。** 逆順にすると、消した後で書き込みに失敗したときにマップそのものが失われる。
この順序であれば、失敗しても残るのは同じ内容の2ファイルであり、利用者が片方を消せば復旧できる。

改名は内容を読み直して `title` と H1 を書き換え、正規化を通して書き戻す。
アプリの外で書かれた Markdown は整形され直すが、これは保存のたびに起きることであり
改名に固有の副作用ではない。
