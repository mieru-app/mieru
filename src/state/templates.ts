/**
 * 新規マップの下敷き（F-01 / 2-10）。
 *
 * **中身は暫定である。** 計画（`docs/project-plan.md` Phase 2）で
 * 「テンプレートの中身は実利用の実感が要る」として未決にしてあり、
 * ここに置いてあるのは仕組みを動かすための最初の版にすぎない。
 * 実際に使って要らない枝が分かったら削ること。
 *
 * 中身は Markdown そのもの。表題（H1 と frontmatter の title）は
 * 作成時に利用者の入力へ差し替わるので、ここでは仮の見出しを置いておけばよい。
 */

export interface Template {
  id: string;
  name: string;
  description: string;
  /** null は「空のマップ」。`createMap` に下敷きを渡さない */
  markdown: string | null;
}

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "空のマップ",
    description: "中心テーマだけ",
    markdown: null,
  },
  {
    id: "swot",
    name: "SWOT",
    description: "強み・弱み・機会・脅威",
    markdown: "# ひな形\n\n- 強み\n- 弱み\n- 機会\n- 脅威\n",
  },
  {
    id: "minutes",
    name: "議事録",
    description: "決まったこと・宿題・論点",
    markdown: "# ひな形\n\n- 決まったこと\n- 宿題\n- 論点\n- 次回\n",
  },
  {
    id: "weekly",
    name: "週次振返り",
    description: "やったこと・気づき・次の一手",
    markdown: "# ひな形\n\n- やったこと\n- 気づき\n- うまくいかなかったこと\n- 次の一手\n",
  },
];

/** id から下敷きの Markdown を引く。見つからなければ空のマップとして扱う */
export function templateMarkdown(id: string): string | undefined {
  return TEMPLATES.find((template) => template.id === id)?.markdown ?? undefined;
}
