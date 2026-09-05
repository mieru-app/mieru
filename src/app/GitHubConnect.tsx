import { useLanguage } from "../state/i18n.js";
import { useState } from "react";

import {
  GITHUB_STORAGE_NOTE,
  GITHUB_TOKEN_STEPS,
  GITHUB_TOKEN_URL,
} from "../state/github-guide.js";
import type { GitHubConnectResult } from "../state/workspace.js";

/**
 * GitHub 保存先への接続（2.6-4）。
 *
 * 入力の妥当性と到達確認は `src/state/` と `src/store/` が行い、
 * ここは入力を集めて結果を出すだけにしてある（CLAUDE.md「描画層に判断を書かない」）。
 * 案内文も `src/state/github-guide.ts` に置いてあり、ここには文言を持たない。
 */

interface Props {
  onConnect: (
    input: { token: string; repo: string; branch: string; directory: string },
    remember: boolean,
  ) => Promise<GitHubConnectResult>;
  onCancel?: () => void;
}

export function GitHubConnect({ onConnect, onCancel }: Props): React.JSX.Element {
  const s = useLanguage((state) => state.s);
  const [token, setToken] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [directory, setDirectory] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<GitHubConnectResult & { ok: false }>();
  const [showSteps, setShowSteps] = useState(false);

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure(undefined);
    void onConnect({ token, repo, branch, directory }, remember)
      .then((result) => {
        if (!result.ok) setFailure(result);
        // 成功した場合は画面ごと切り替わるので、ここで何もしない
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const errorFor = (field: string): string | null =>
    failure !== undefined && failure.field === field ? failure.message : null;

  return (
    <form className="ghconnect" onSubmit={submit}>
      <label htmlFor="gh-repo">{s.github.repo}</label>
      <input
        id="gh-repo"
        value={repo}
        onChange={(event) => setRepo(event.target.value)}
        placeholder={s.github.repoPlaceholder}
        autoComplete="off"
        spellCheck={false}
      />
      {errorFor("repo") !== null && <p className="ghconnect-error">{errorFor("repo")}</p>}

      <label htmlFor="gh-token">{s.github.token}</label>
      <input
        id="gh-token"
        type="password"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder="github_pat_…"
        autoComplete="off"
        spellCheck={false}
      />
      {errorFor("token") !== null && <p className="ghconnect-error">{errorFor("token")}</p>}

      <button
        type="button"
        className="ghconnect-disclosure"
        aria-expanded={showSteps}
        onClick={() => setShowSteps(!showSteps)}
      >
        {showSteps ? "▾" : "▸"} {s.github.howTo}
      </button>
      {showSteps && (
        <div className="ghconnect-steps">
          <p>
            <a href={GITHUB_TOKEN_URL} target="_blank" rel="noreferrer noopener">
              {s.github.openTokenPage}
            </a>
          </p>
          <ol>
            {GITHUB_TOKEN_STEPS.map((step) => (
              <li key={step.title}>
                <strong>{step.title}</strong>
                <span>{step.detail}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <details className="ghconnect-advanced">
        <summary>{s.github.advanced}</summary>
        <label htmlFor="gh-directory">{s.github.directory}</label>
        <input
          id="gh-directory"
          value={directory}
          onChange={(event) => setDirectory(event.target.value)}
          placeholder={s.github.directoryPlaceholder}
          autoComplete="off"
          spellCheck={false}
        />
        {errorFor("directory") !== null && (
          <p className="ghconnect-error">{errorFor("directory")}</p>
        )}

        <label htmlFor="gh-branch">{s.github.branch}</label>
        <input
          id="gh-branch"
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
          placeholder={s.github.branchPlaceholder}
          autoComplete="off"
          spellCheck={false}
        />
        {errorFor("branch") !== null && <p className="ghconnect-error">{errorFor("branch")}</p>}
      </details>

      <label className="ghconnect-remember">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
        />
        {s.github.remember}
      </label>
      <p className="ghconnect-note">{GITHUB_STORAGE_NOTE}</p>

      {failure !== undefined && failure.field === undefined && (
        <p className="ghconnect-error" role="alert">
          {failure.message}
        </p>
      )}

      <div className="ghconnect-actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? s.github.verifying : s.github.connect}
        </button>
        {onCancel !== undefined && (
          <button type="button" onClick={onCancel} disabled={busy}>
            {s.github.cancel}
          </button>
        )}
      </div>
    </form>
  );
}
