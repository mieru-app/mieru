import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SOURCE_URL } from "../project.js";

/**
 * ソースコードの置き場所の検証。
 *
 * **画面から出る唯一の外部リンクである。** 行き先が実際のリポジトリでなければ、
 * 「疑うなら読める」という信用の説明（`SECURITY.md`）が成立しない。
 * 移管でオリジンが変わった実績があるため、**`package.json` を正本として突き合わせる。**
 */

interface PackageJson {
  repository: { url: string };
}

function repositoryUrl(): string {
  const path = new URL("../../../package.json", import.meta.url);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as PackageJson;
  // `git+https://github.com/mieru-app/mieru.git` の形で入っている
  return parsed.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
}

describe("ソースコードの置き場所", () => {
  it("package.json の repository と一致する", () => {
    expect(SOURCE_URL).toBe(repositoryUrl());
  });

  /**
   * **`http:` で出すと、経路上の誰かが差し替えた画面へ送れる。**
   * 確かめに来た人を偽のソースへ導くのは、リンクが無いより悪い。
   */
  it("https の github.com を指す", () => {
    const url = new URL(SOURCE_URL);
    expect(url.protocol).toBe("https:");
    expect(url.host).toBe("github.com");
  });
});
