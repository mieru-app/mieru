import { describe, expect, it } from "vitest";

import type { MapStore } from "../types.js";
import { ConflictError, MapNotFoundError } from "../types.js";

/**
 * MapStore の契約テスト。
 *
 * 実装を追加したら必ずこのスイートを流用して通すこと
 * （LocalFolderStore / S3Store / SyncingStore）。
 * 楽観ロックの挙動が実装ごとにずれると、競合時にデータを失う。
 *
 * 仕様: docs/design.md 8.1 および src/store/types.ts の write() の表
 */

const MD_A = `---
title: A
tags: [x]
created: 2026-09-01T00:00:00Z
updated: 2026-09-01T00:00:00Z
---

# A

- 子
`;

const MD_B = MD_A.replace("# A", "# A2");

export function describeMapStoreContract(name: string, create: () => MapStore): void {
  describe(`${name} は MapStore の契約を満たす`, () => {
    it("空の状態では一覧が空", async () => {
      await expect(create().list()).resolves.toEqual([]);
    });

    it("新規作成して読み戻せる", async () => {
      const store = create();
      const version = await store.write("a.md", MD_A, null);
      await expect(store.read("a.md")).resolves.toEqual({ md: MD_A, version });
    });

    it("一覧が frontmatter のメタ情報を返す", async () => {
      const store = create();
      const version = await store.write("a.md", MD_A, null);
      await expect(store.list()).resolves.toEqual([
        {
          id: "a.md",
          title: "A",
          tags: ["x"],
          created: "2026-09-01T00:00:00Z",
          updated: "2026-09-01T00:00:00Z",
          version,
        },
      ]);
    });

    it("正しい baseVersion なら上書きできる", async () => {
      const store = create();
      const v1 = await store.write("a.md", MD_A, null);
      const v2 = await store.write("a.md", MD_B, v1);
      expect(v2).not.toBe(v1);
      await expect(store.read("a.md")).resolves.toEqual({ md: MD_B, version: v2 });
    });

    it("baseVersion が古いと ConflictError を投げ、サーバ側の内容を伴う", async () => {
      const store = create();
      const v1 = await store.write("a.md", MD_A, null);
      const v2 = await store.write("a.md", MD_B, v1);

      // v1 を握ったままの書き込み（別端末で編集していた状況）
      const error = await store.write("a.md", "# 古い版\n", v1).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictError);
      const conflict = error as ConflictError;
      expect(conflict.id).toBe("a.md");
      expect(conflict.serverVersion).toBe(v2);
      // 競合解決のためにサーバ側の内容を提示できること（データを失わないため）
      expect(conflict.serverMd).toBe(MD_B);

      // 衝突した書き込みは反映されていないこと
      await expect(store.read("a.md")).resolves.toEqual({ md: MD_B, version: v2 });
    });

    it("既存 id に baseVersion=null で書くと ConflictError", async () => {
      const store = create();
      await store.write("a.md", MD_A, null);
      await expect(store.write("a.md", MD_B, null)).rejects.toBeInstanceOf(ConflictError);
    });

    it("存在しない id に baseVersion を指定すると MapNotFoundError", async () => {
      const store = create();
      await expect(store.write("missing.md", MD_A, "v1")).rejects.toBeInstanceOf(MapNotFoundError);
    });

    it("存在しない id の read は MapNotFoundError", async () => {
      await expect(create().read("missing.md")).rejects.toBeInstanceOf(MapNotFoundError);
    });

    it("削除すると一覧から消え、read できなくなる", async () => {
      const store = create();
      await store.write("a.md", MD_A, null);
      await store.remove("a.md");
      await expect(store.list()).resolves.toEqual([]);
      await expect(store.read("a.md")).rejects.toBeInstanceOf(MapNotFoundError);
    });

    it("存在しない id の remove は MapNotFoundError", async () => {
      await expect(create().remove("missing.md")).rejects.toBeInstanceOf(MapNotFoundError);
    });

    it("複数のマップを独立に扱える", async () => {
      const store = create();
      await store.write("a.md", MD_A, null);
      await store.write("b.md", MD_B, null);
      const metas = await store.list();
      expect(metas.map((m) => m.id).sort()).toEqual(["a.md", "b.md"]);
    });
  });
}
