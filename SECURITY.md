# Security Policy

日本語での報告も歓迎します。英語で書くのは、読む人が世界中にいるためです。

## Reporting a vulnerability

**Please do not open a public issue.**

Use **[Report a vulnerability](https://github.com/mieru-app/mieru/security/advisories/new)**
on this repository's Security tab. That opens a private advisory only you and the
maintainer can read.

If that does not work for you, email **krikri1008@gmail.com**.

Helpful things to include, if you have them:

- What an attacker can do, not just what looks wrong
- Steps to reproduce, or a short proof of concept
- The browser and version you saw it in
- Whether the storage backend was a local folder or a GitHub repository

**Mieru is maintained by one person in their spare time. There is no bug bounty.**
Expect an acknowledgement within **7 days** and an assessment within **30 days**.
If you have not heard back in 7 days, please send a reminder. It means the first
message got lost, not that it was ignored.

Please give a reasonable amount of time for a fix before disclosing publicly.
**If a report is valid and you want credit, you will get it** in the advisory and
the release notes, unless you ask otherwise.

## What is worth reporting

Mieru is a static site with **no server and no database**. It runs entirely in the
browser and holds a GitHub token for the storage backend the user configured.
**Everything that matters is about that token, or about code execution in the page.**

Things worth reporting:

| Area | Example |
|---|---|
| **Cross-site scripting** | Escaping a `.md` file into script execution. The inline renderer (`src/core/inline.ts`) is an allow-list that produces HTML, and its output goes straight into `innerHTML` on the canvas. That is the highest-value target in this codebase |
| **CSP bypass** | Getting a network request out to a host other than `api.github.com` |
| **Token exposure** | Reading the stored credential from somewhere that should not have it, or getting it into a log, a URL, an error message, or a saved `.md` file |
| **Confused deputy on the GitHub API** | Making the app write to a repository or path the user did not name |
| **Data destruction** | An input that makes the app overwrite or delete a map that should not have been touched |
| **Supply chain** | A vulnerability in a dependency that actually ships in the bundle (see `dependencies` in `package.json`) |

## What is already known, and not a finding

**These are documented decisions, not oversights.** Reporting them is welcome as a
discussion, but they will not be treated as vulnerabilities.

- **The GitHub token is stored unencrypted in IndexedDB.** Encrypting it in the
  browser means putting the key in the same browser, which looks like protection
  without being protection. The mitigation is scope: users are told to create a
  fine-grained token limited to one repository, Contents permission only, with an
  expiry. Users can also decline to persist it at all
- **Code delivered from the origin can read that token.** This is inherent to any
  browser-only app that handles credentials. It is mitigated by loading no
  third-party scripts, fonts or analytics, and by a CSP that limits `connect-src`
  to `api.github.com`
- **`style-src` allows `'unsafe-inline'`.** `mind-elixir` injects styles directly.
  Exfiltration depends on `connect-src` and `script-src`, which stay strict
- **`frame-ancestors` is not set.** It only works as an HTTP header, and GitHub
  Pages does not let us set headers. If you have a practical clickjacking attack
  against this app, that is worth reporting

## Out of scope

- **Self-hosted deployments on a shared origin.** If you host Mieru on
  `<yourname>.github.io` next to other pages, those pages share the origin and can
  read the storage. This is called out in `README.md` and `CONTRIBUTING.md`
- Anything requiring physical access to an unlocked device
- Social engineering, or getting a user to paste attacker-supplied content into
  their own browser console
- Missing headers that a static site on GitHub Pages cannot set
- Reports produced by a scanner with no explanation of impact
- Vulnerabilities in GitHub itself. Report those to
  [GitHub](https://bounty.github.com/)

## Supported versions

**Only the version currently deployed at https://mieru-app.github.io/mieru/ and the
tip of `main`.** There are no release branches and no backports. Mieru is a
single-page app served from a static host, so a fix reaches every user on their
next load.

If you run your own build, update it from `main`.

## What happens after a report

1. The report is acknowledged and reproduced
2. Impact is assessed and a fix is written on a private fork of the repository
3. A GitHub Security Advisory is published, with a CVE requested if it warrants one
4. The fix is deployed. **Because deployment is a static site, users get it on reload**
5. The reporter is credited, unless they prefer not to be

**Users are not asked to take action for most fixes.** The exception is anything that
could have exposed a token. In that case the advisory will say so plainly and tell
users to revoke and reissue theirs.

## Design documents

The threat model and the decisions behind it are written down, in Japanese:

- [Trust boundary and security](./docs/design/security.md)
- [Delivery, origin and CSP](./docs/design/delivery.md)
- [GitHub storage backend](./docs/design/github-store.md)
- [Non-functional requirements](./docs/design/requirements.md) (NF-40 to NF-44)
