import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * 配信先のサブパス（設計書 8.6）。
 *
 * GitHub Pages では `/<リポジトリ名>/` になる。独自ドメインへ移す判断をしても
 * コードを変えずに済むよう、環境変数で与える。
 */
const base = process.env["BASE_PATH"] ?? "/";

/** PWA の manifest。`start_url` と `scope` を base に合わせる必要があるため生成する */
function manifest(): string {
  return JSON.stringify(
    {
      name: "Mieru",
      short_name: "Mieru",
      description: "考えを整理し、そのまま AI に渡せるマインドマップツール",
      lang: "ja",
      dir: "ltr",
      start_url: base,
      scope: base,
      display: "standalone",
      background_color: "#0A0F1F",
      // アイコンの地と同じ色（設計書 12.6）。起動時のちらつきを抑える
      theme_color: "#0A0F1F",
      icons: [
        // any と maskable はファイルを分ける（"any maskable" とまとめない）
        { src: `${base}icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
        {
          src: `${base}icons/icon-maskable-512.png`,
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    null,
    2,
  );
}

/**
 * Content Security Policy（設計書 NF-43）。
 *
 * **利用者のトークンを持ち出す経路を、ブラウザ側に塞がせる。**
 * 本ツールは第三者のスクリプトを読み込まない方針だが、方針は破れる。
 * 解析ツールを1つ足した瞬間、それは同一オリジンで動き、IndexedDB のトークンを
 * 読んで外部へ送れる。CSP を置けば、そのコードは**書いても動かない**。
 *
 * 要は `connect-src` である。通信先を GitHub API に限れば、
 * 万一トークンを読まれても送り先が無い。
 *
 * `style-src` に `'unsafe-inline'` が要るのは `mind-elixir` が
 * スタイルを直接注入するため。持ち出しに関わるのは `connect-src` と
 * `script-src` なので、防御の要は損なわれない。
 *
 * `frame-ancestors` は meta では効かない（HTTP ヘッダ専用）。
 * GitHub Pages はヘッダを設定できないため、埋め込み防止は別の手段が要る。
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // 通信先は GitHub API だけ。ここが本体
  "connect-src 'self' https://api.github.com",
  "script-src 'self'",
  // mind-elixir がスタイルを注入する
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  // フォームは送信しない（作成画面は preventDefault で受ける）
  "form-action 'none'",
].join("; ");

/**
 * CSP をビルド成果物にだけ入れる。
 *
 * 開発サーバに同じ制限を掛けると起動しない。Vite は HMR のために
 * インラインスクリプトと WebSocket を使うためで、そこを許すと
 * 本番の CSP が緩む。**緩めるより、開発サーバには入れない。**
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: "mieru-csp",
    apply: "build",
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: "meta",
            attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY },
            injectTo: "head-prepend",
          },
        ],
      };
    },
  };
}

/** manifest をビルド出力へ書き出し、開発サーバでも同じ内容を返す */
function webManifest(): Plugin {
  const fileName = "manifest.webmanifest";
  return {
    name: "mieru-webmanifest",
    configureServer(server) {
      server.middlewares.use(`${base}${fileName}`, (_request, response) => {
        response.setHeader("Content-Type", "application/manifest+json");
        response.end(manifest());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName, source: manifest() });
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), webManifest(), contentSecurityPolicy()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // カバレッジの対象は変換エンジン・永続化・編集ロジックに限定する。
      // React の描画層は自動テストを整備せず手動試験に委ねる方針（docs/design/testing.md）。
      // その代わり、編集の正しさは src/state/ の純粋関数として検証できるようにしている。
      include: ["src/core/**/*.ts", "src/store/**/*.ts", "src/state/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**"],
      /*
       * **要件があるのは変換層だけである**（NF-50）。
       * 以前は3つの層へ一律に 90% を掛けており、要件より厳しかった。
       *
       * **分岐だけは別の数字にしてある。** `noUncheckedIndexedAccess` を
       * 有効にしているため、`lines[at] ?? ""` のような**到達不能な防御分岐**が
       * 大量に生まれる。2026-09-05 に `note.ts` の未到達分岐を1つずつ確かめたところ、
       * **14箇所すべてがこれだった。** テストを足しても通せない。
       *
       * **それでも分岐を捨てない。** 同日 `note.ts` をテスト無しで足したとき、
       * 文・行・関数はどれも動かず（97.7→97.9）、**分岐だけが 92.3% → 88.5% と
       * 落ちて気付けた。** 抜けを実際に捉えたのはこの指標である。
       */
      thresholds: {
        // 変換層。NF-50 の対象であり、ここは4つとも要件どおり 90%
        "src/core/**": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        // 永続化と編集ロジック。要件は無いが、崩れたら気付ける床として置く
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
  },
});
