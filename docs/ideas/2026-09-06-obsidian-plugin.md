# Obsidian プラグイン版を出せるか（2026-09-06）

**正本ではない。書かれた時点の事実と判断である。**

問い: **ブラウザ版の使い勝手と品質を落とさずに、Obsidian のコミュニティプラグインとしても
出せるか。**

---

## 決定（2026-09-06）

**保留する。技術的には出せるが、保守性の代償を今は払わない。**

出せること自体は下の調査のとおりである。**それでも保留にしたのは、
道 B を採っても消えない費用が1つ残るためである。**

> **シェル層の保守が2倍になる。`src/app/` と `src/views/` には自動テストが無い。**

いまは実利用期間であり、保守しているのは1人である。
**検証できない層を2つに増やす判断は、この段階では割に合わない。**

### 再検討する条件

- 実利用で「Obsidian の中で使いたい」という声が実際に出たとき
- `src/app/` の判断が `src/state/` へ移り、**シェルが薄くなったとき**
  （`CLAUDE.md` が既に求めていることで、6章の「standalone が良くなる側面」の裏返し）
- 保守する人が増えたとき

**この文書は捨てない。** 調べ直す費用を二度払わないためである。

---

[STP とマーケティング](./2026-09-05-stp-and-marketing.md) の「判断が要る点2」で
「当面は作らない方に寄る」としたが、**そこでの前提は「ブラウザ版の代わりに出す」だった。**
併存が前提なら判断が変わる。

---

## 1. 結論

**出せる。そして standalone を傷つけずに作る道がある。**

決め手は、**どの道を選ぶかである。**

| 道 | standalone への影響 |
|---|---|
| **A: `App.tsx` を共通シェルへ作り替える** | ❌ **傷つく。** リポジトリで最もテストの無いファイル（632行）を触る |
| **B: プラグイン側に別のルートを書き、`app/` より下を再利用する** | ✅ **standalone のファイルは1行も変わらない** |

**B を採るなら、あなたの条件（品質と保守性を落とさない）を満たせる。**

残る費用は1つだけである。**シェル層の保守が2倍になり、そこには自動テストが無い。**
ただしこれには、standalone を良くする副作用もある（4章）。

---

## 2. 実測 — 何が host に縛られているか

### 保存先の呼び出しは `src/app/` にしか無い

```
localStorage / IndexedDB / File System Access の実呼び出し

src/app/App.tsx      8
src/app/download.ts  1
src/store/           （Vault 実装に置き換わる層なので対象外）
src/core/            0
src/state/           0   ← ヒットは全てコメント
src/views/           0
```

**`src/state/` には `localStorage` の呼び出しが1つも無い。** 鍵の定数と
「壊れた値を既定へ倒す」純関数だけを持ち、**実際の読み書きは `App.tsx` がしている。**

```ts
// App.tsx
setTheme(readTheme(localStorage.getItem(THEME_KEY)));
readPaneWidth("sidebar", localStorage.getItem(PANE_KEYS.sidebar));
```

**プラグイン側は `readTheme(pluginData.theme)` と呼ぶだけでよい。**
`src/state/` は1行も変わらない。

### 変換エンジンは移植の対象ですらない

```
src/core/ のブラウザ API 使用箇所: 0
```

`document.` の出現は YAML の `Document` という局所変数、`window.opener` はコメントだった。

### 描画層に残るブラウザ API は2つだけ

| 箇所 | 中身 | Electron で動くか |
|---|---|---|
| `Outline.tsx` | `document.elementFromPoint`（並べ替えの当たり判定） | ✅ |
| `i18n.ts` | `document.documentElement.lang` | ✅ |

### 永続化の境界が4メソッドしかない

`MapStore`（`src/store/types.ts`）は `list` / `read` / `write` / `remove` と、
任意の `watch` / `autosaveDelayMs`。**設計原則3が「UI 層は `MapStore` 経由でのみ
永続化する」と定めているため、ここを差し替えれば保存先が変わる。**
Phase 3 のクラウド同期のために用意した継ぎ目が、そのまま使える。

### バンドル量

```
dist/assets/index-*.js   583.62 kB（gzip 181.70 kB）
```

GitHub 関連（`GitHubStore` 593行 ＋ `github-auth` 441行）を落とすので、
プラグインの `main.js` は **500 kB 前後**に収まる見込みである。

---

## 3. Obsidian 側の制約（文書で確認。実装して確かめてはいない）

### `.md` を独自ビューに割り当てることはできない

`registerExtensions()` は拡張子とビュー型を結び付けられるが、
**`md` だけは常に標準の Markdown ビューに固定される。**

**回避策が実運用で確立している。** Excalidraw は `.excalidraw.md` という
**普通の Markdown ファイル**を扱いながら、`registerView()` で独自ビューを登録し、
`leaf.setViewState()` でビューを差し替えている。
**この方式ならファイルは最後まで普通の `.md` のままで、原則1を壊さない。**

### Vault API は `MapStore` にそのまま対応する

| `MapStore` | Obsidian |
|---|---|
| `list()` | `vault.getMarkdownFiles()` を対象フォルダで絞る |
| `read()` | `vault.read()`（`cachedRead()` は書き戻す前に使わない） |
| `write()` | `vault.process()`。読みと書きの間に変わらないことを保証する |
| `remove()` | `vault.trash()` |
| `watch()` | `vault.on("modify" \| "rename" \| "delete")` |

**`watch()` はブラウザ版より良くなる。** いまは最大30秒のポーリングだが、
Obsidian はイベントで即座に伝えてくる。

### 規約で引っかかる点は1つある

| 規約 | Mieru |
|---|---|
| LICENSE / 難読化禁止 / テレメトリ禁止 / 自己更新禁止 / 商標 | ✅ |
| Vault API を使う（Node の `fs` ではなく） | 新規実装なので満たせる |
| インラインスタイルを避け CSS 変数を使う | 対応可（6章） |
| **`innerHTML` を利用者入力に使わない** | ⚠️ **該当する。次節** |

---

## 4. `innerHTML` の問題（今日見つけた最大の論点）

`mind-elixir` はノードのラベルを、`markdown` オプションが指定されているときだけ
`innerHTML` で描く。**Mieru はそれを指定している。**

```ts
// src/views/Canvas/Canvas.tsx:147
markdown: (topic: string) => renderInlineHtml(topic),
```

**つまり利用者の `.md` の中身が `innerHTML` に入る。**

### いまの防御

```
escapeHtml()      & < > を置換
safeHref()        javascript: / data: / vbscript: を許可制で弾く
                  タブ・改行・NUL を挟んだ難読化もプロパティテストで検証
リンク            rel="noopener noreferrer" を強制
inline.test.ts    23件
src/core/**       4指標とも 90% を CI の門にしている
```

**防御自体は監査済みで、主張できる水準にある。**

### それでも Obsidian では重みが違う

ブラウザ版は CSP で守られており、通信先は `api.github.com` だけに縛ってある。
**Obsidian のプラグインにはその壁が無く、レンダラは Node に届く。**
同じ実装でも、破られたときの被害が違う。

さらに **2026年から審査が自動化され、毎版が走る。** `innerHTML` への代入は
機械的に拾われる可能性が高い。**止まるかどうかは分からないが、説明を求められる前提で臨む。**

### 逃げ道はある

**プラグインのビルドでだけ `markdown` オプションを外す。** `mind-elixir` は
指定が無ければ `textContent` に落ちる。ラベル中のリンクや強調が
ただの文字になるが、**構造も往復も一切変わらない。**

---

## 5. 設計案 — 道 B

```
src/core/     そのまま      0行
src/state/    そのまま      0行   ← 実測で localStorage 呼び出しが無い
src/views/    そのまま      0行
src/app/      そのまま      0行   ← 部品（Toolbar・EditBar・Banners…）は再利用
                                    App.tsx と download.ts だけ使わない
------------------------------------------------------------------
plugin/       新規
  main.ts                   プラグイン本体・ビュー登録・設定画面
  MieruView.tsx             App.tsx に相当するルート（保存先と好みの配線）
  ObsidianVaultStore.ts     MapStore の実装
  download.ts               書き出し先を vault にする
  obsidian-theme.css        Mieru のトークンを Obsidian の CSS 変数へ橋渡し
```

**standalone のファイルを1つも変更しない。** これが道 B の定義である。

### ビューの出し方 — 自動で乗っ取らない

既定は「コマンドとリボンから開く」にする。`mm:` を持つファイルを黙って
独自ビューで開くと、**利用者は自分のファイルが何に開かれるかを制御できなくなる。**
ゲストモードとアクセス権の扱いで避けたのと同じ性質の不信である。
設定で「`mm:` があれば自動で開く」を選べるようにし、**既定は off。**

### 捨てるもの

| 捨てる | 理由 |
|---|---|
| `GitHubStore` ＋ `github-auth`（1,034行） | Obsidian Sync や git プラグインの領分。**トークンを預からずに済み、審査の危険も減る** |
| `LocalFolderStore` ＋ `directory-handle` ＋ `fsa` | Vault API に置き換わる |
| `IdbHistoryStore` | v1 では落とす（8章の判断待ち） |
| Service Worker・PWA manifest | 不要 |

---

## 6. standalone への影響を、正直に並べる

### 変わらないもの

- `src/core/` `src/state/` `src/views/` `src/app/` の**コードは1行も変わらない**
- ブラウザ版の CSP・通信先の制限・PWA・GitHub 連携は**そのまま**
- テストも CI の門も**そのまま**

### 増える費用（永続的）

**1. シェル層の保守が2倍になる。**
`src/app/` と `src/views/` は自動テストを持たない（`CLAUDE.md`）。
プラグイン側のルートも同じである。**画面を変えるたびに2つの host で確かめることになる。**

**2. 複製がずれる。** `MieruView.tsx` は `App.tsx` の配線を写したものになる。
放っておけば必ずずれる。

**3. 機能差が説明を要する。** v1 で履歴と GitHub を落とすと、
「同じ製品の別の入口」と言い切れなくなる。

### 増えない費用

**`src/core/` の品質は影響を受けない。** ここが Mieru の生命線であり、
プラグイン側から触る理由が1つも無い。**ラウンドトリップの強保証は無傷である。**

### standalone が良くなる側面

`CLAUDE.md` は既にこう定めている。

> **描画層に判断を書かない。** 判断は `src/state/` に置き、描画層はそれを呼ぶだけにする。
> `src/app/` と `src/views/` は自動テストを持たないため、
> **判断が漏れた分だけ検証できない領域が増える。**

**プラグインを作ると、この規則の違反が機械的に炙り出される。**
2つの host が共に必要とする判断は、必ず `src/state/` へ出すことになる。
そこは**テストのある層**である。

**つまり「保守が2倍」の圧力が、判断をテストのある場所へ押し出す。**
やり方次第で、standalone の検証できない面積はむしろ減る。

---

## 7. 手間の見積り

| 作業 | 見積り |
|---|---|
| `ObsidianVaultStore` ＋ テスト | 3日 |
| `MieruView.tsx`（`App.tsx` の配線を移す） | 4日 |
| プラグインの外殻（`main.ts`・ビュー・設定画面） | 2日 |
| CSS の橋渡し（トークン→Obsidian 変数） | 1日 |
| ビルド経路（esbuild・CommonJS・`obsidian` を external） | 1日 |
| 実機確認（デスクトップ・モバイル） | 3日 |
| 審査対応 | 未知 |

**約2.5週間。** 審査の待ち時間は含まない。

---

## 8. 判断が要る点

1. **`innerHTML` をどう扱うか。** 監査済みの実装で押し通すか、
   プラグイン版だけ `markdown` オプションを外すか。
   **審査に出す前に Obsidian のフォーラムで先に聞くのが安い**（4章）
2. **モバイルに対応するか。** Obsidian のモバイルは webview で Node API が無い。
   Mieru 側の障害は無いが、**`mind-elixir` のタッチ操作を確認していない。**
   `isDesktopOnly: true` で逃げられるが、S2 の一部を捨てる
3. **履歴を v1 で落とすか。** 落とすとブラウザ版より機能が少ない版が世に出る
4. **告知との順序。** 告知は1日の作業なので**並行できる。**
   むしろ告知でブラウザ版を触ってもらってから
   「プラグイン版も作っています」と言える方が強い

---

## 9. 置き場所

**同じリポジトリでよい。** git のタグもリリースも使っていないため、
Obsidian が要求する「タグ＝`manifest.json` の version」と衝突しない。
NF-44（`mieru-app` に Mieru 以外を公開しない）にも触れない。

---

## 出典（2026-09-06 に確認）

- [Developer policies – Obsidian Developer Docs](https://docs.obsidian.md/Developer+policies)
- [Submit your plugin – Obsidian Developer Docs](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)
- [Plugin guidelines – Obsidian Developer Docs](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Views – Obsidian Developer Docs](https://docs.obsidian.md/Plugins/User+interface/Views)
- [Vault – Obsidian Developer Docs](https://docs.obsidian.md/Plugins/Vault)
- [Custom File Extensions Plugin](https://github.com/MeepTech/obsidian-custom-file-extensions-plugin)（`md` が変更できないことの出典）
- [obsidian-excalidraw-plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin)（`.excalidraw.md` とビュー差し替え）
- [Enhancing Mindmap – Obsidian Stats](https://www.obsidianstats.com/plugins/obsidian-enhancing-mindmap)（総DL 236,450・最終更新約3年前）
- [The future of Obsidian plugins](https://obsidian.md/blog/future-of-plugins/)（審査の自動化）
