import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

/**
 * 同じルールを複数ブロックで設定すると後のブロックが前を上書きするため、
 * no-restricted-imports は「ファイル集合が重ならない3ブロック」に分けている。
 * ブロックを増やすときは対象が他と重複しないことを必ず確認すること。
 */

const UI_DIRS = ["src/views/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}"];

/** UI 層から永続化 API を直接呼ばせない（NF-51 / 設計原則3） */
const denyPersistenceImports = {
  group: ["@aws-sdk/*", "aws-amplify", "aws-amplify/*", "idb", "idb-keyval"],
  message: "UI 層から永続化 API を直接呼ばない。MapStore 経由で行うこと（docs/design.md 8.1）。",
};

/** mind-elixir への依存は src/views/Canvas/ に閉じ込める（docs/design.md 12.1） */
const denyMindElixirImports = {
  group: ["mind-elixir", "mind-elixir/*"],
  message: "mind-elixir を import してよいのは src/views/Canvas/ のみ。",
};

/** UI 層で禁止するグローバル（ファイルピッカー・IndexedDB の直接利用） */
const restrictedGlobals = [
  "showDirectoryPicker",
  "showOpenFilePicker",
  "showSaveFilePicker",
  "indexedDB",
].map((name) => ({
  name,
  message: "永続化は MapStore 経由で行うこと（docs/design.md 8.1）。",
}));

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", "infra/cdk.out/**"],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // ── 1. UI 層以外（core / store / state など）─────────────────────────
  // store は S3Store で AWS SDK を正当に使うため、永続化 API は禁止しない。
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: UI_DIRS,
    rules: {
      "no-restricted-imports": ["error", { patterns: [denyMindElixirImports] }],
    },
  },

  // ── 2. UI 層のうち Canvas 以外 ────────────────────────────────────────
  {
    files: UI_DIRS,
    ignores: ["src/views/Canvas/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [denyPersistenceImports, denyMindElixirImports] },
      ],
      "no-restricted-globals": ["error", ...restrictedGlobals],
    },
  },

  // ── 3. Canvas のみ（mind-elixir の使用を許可）─────────────────────────
  {
    files: ["src/views/Canvas/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [denyPersistenceImports] }],
      "no-restricted-globals": ["error", ...restrictedGlobals],
    },
  },

  // 設定ファイルと補助スクリプトは型情報付き解析の対象外にする。
  // tsconfig の include に入っていないため、型情報を要求すると解析できない。
  {
    files: ["*.config.js", "eslint.config.js", "assets/**/*.mjs", "scripts/**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: { projectService: false, project: false },
      // Node で直接実行するスクリプト
      globals: { console: "readonly", process: "readonly" },
    },
  },

  prettier,
);
