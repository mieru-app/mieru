import { describe, expect, it } from "vitest";

import type { ViewMode } from "../view-mode.js";
import {
  isEditableMode,
  nextViewMode,
  VIEW_MODE_LABELS,
  VIEW_MODE_SHORT_LABELS,
  VIEW_MODES,
} from "../view-mode.js";

describe("VIEW_MODES", () => {
  it("キャンバスが先頭にある", () => {
    // 先頭が既定であり、マップを開いた直後に出る画面になる（`editor.ts`）
    expect(VIEW_MODES[0]).toBe("canvas");
  });

  it("重複しない", () => {
    expect(new Set(VIEW_MODES).size).toBe(VIEW_MODES.length);
  });

  it("すべてに正式な名前と短い字がある", () => {
    // 欠けると押しボタンの字が空になり、押す前に何の画面か分からなくなる
    for (const mode of VIEW_MODES) {
      expect(VIEW_MODE_LABELS[mode]).not.toBe("");
      expect(VIEW_MODE_SHORT_LABELS[mode]).not.toBe("");
    }
  });

  it("短い字は3文字以内で、互いに紛れない", () => {
    // 360px の画面に3つ並ぶ上限（`view-mode.ts` の見積り）
    const short = VIEW_MODES.map((mode) => VIEW_MODE_SHORT_LABELS[mode]);
    for (const label of short) expect(label.length).toBeLessThanOrEqual(3);
    expect(new Set(short).size).toBe(short.length);
  });
});

describe("nextViewMode", () => {
  it("並び順のとおりに進む", () => {
    expect(nextViewMode("canvas")).toBe("outline");
    expect(nextViewMode("outline")).toBe("source");
  });

  it("端まで来たら先頭へ戻る", () => {
    expect(nextViewMode("source")).toBe("canvas");
  });

  it("繰り返すと全ての画面を通って元へ戻る", () => {
    // どれか1つを飛ばすと、Ctrl+E だけではその画面へ行けなくなる
    const seen = new Set<string>();
    let mode: ViewMode = VIEW_MODES[0];
    for (let i = 0; i < VIEW_MODES.length; i += 1) {
      seen.add(mode);
      mode = nextViewMode(mode);
    }
    expect(seen).toEqual(new Set(VIEW_MODES));
    expect(mode).toBe(VIEW_MODES[0]);
  });
});

describe("isEditableMode", () => {
  it("Markdown は読むだけである", () => {
    expect(isEditableMode("source")).toBe(false);
  });

  it("キャンバスとアウトラインからは書き換えられる", () => {
    expect(isEditableMode("canvas")).toBe(true);
    expect(isEditableMode("outline")).toBe(true);
  });

  it("書き換えられる画面が1つ以上ある", () => {
    // 全部が読み取り専用になると、編集できないアプリになる
    expect(VIEW_MODES.filter(isEditableMode).length).toBeGreaterThan(0);
  });
});
