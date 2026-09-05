# Mieru

**English** ｜ [日本語](./README.ja.md)

**A place to build the draft you hand to an AI, kept as plain `.md` the whole time.**
Spread your ideas out as a mind map, and what you get is an ordinary Markdown file.
There is no export step. **Markdown is the save format itself.**

**➜ [https://mieru-app.github.io/mieru/](https://mieru-app.github.io/mieru/)**
(Nothing to install. Open it in a browser and start.)

---

## Problems this solves

**You want to ask an AI, but your thinking is not organized yet.**
The more you write, the more scattered it gets, and you end up pasting a wall of text.
In Mieru you spread the branches until the shape makes sense, and
**that shape is the input.** Organizing and writing up are no longer two jobs.

**You draw a mind map, and it falls apart when you export it.**
Most tools save in their own format, and Markdown export is a lossy afterthought.
Mieru has no export step, because there is nothing to convert.

**You are keeping notes and maps in two places.**
The file on disk is a `.md`, so Obsidian or VS Code opens the very same file.
Put it in Git and you can read how your thinking changed, as a diff.

**You worry about what happens if the app goes away.**
What is left is a `.md` file. **If Mieru disappears, your data is untouched
and every other tool can still read it.**

---

## How to use it

**1. Open it.** Just the link above. No account, no sign-up.

**2. Pick where files are saved.** Two options, switchable at any time.

| Storage | What lands there | Where it works |
|---|---|---|
| **A folder on this computer** | `.md` files directly in the folder you pick | Desktop Edge / Chrome |
| **A GitHub repository** | `.md` files in the repo you name (each save is a commit) | Any device |

**3. Write.** `Tab` adds a child, `Enter` adds a sibling. That is enough to get a shape.
Press `?` for the full key list. On a phone, the buttons at the bottom do the same things.
**There is no save button.** It saves when you stop typing.

**4. Hand it to an AI.** `Ctrl+Shift+C` copies your map as prose an AI reads well.
Select a branch first and only that part is copied.

Here is what you actually get on disk:

```markdown
---
title: Where to take the new product
tags: [strategy]
---

# Where to take the new product

- Market 🌏
  - Size
    Published reports say $1.2B, but the definition looks too wide.
    Narrowed to what we could actually reach, $300M is the honest number.
  - Where nobody is competing
- Risks ⚠️
  - Regulation → [[Market]]
```

---

## What it is good for

**Prep before you prompt.**
Split the question into branches, then say "draft this for me, following this structure."
The answer comes back specific. Send one branch at a time and nothing gets buried.

**Reading and study notes.**
Chapters become branches; what you noticed goes in the note under each one.
**Notes never appear on the canvas**, so the map stays light while the content gets thick.

**Inside an Obsidian vault.**
Point Mieru at a folder in your vault and your maps sit next to your notes.
Wiki-style links work as you would expect.

**Catching ideas away from your desk.**
With GitHub as the storage, the same map opens on your phone,
and you pick it up on your computer later.

---

## What it can and cannot do

**The limits come first.** Better to know now than thirty minutes in.

### It cannot

| Not supported | Why |
|---|---|
| **Embedded images** | Deliberately out of scope, to keep the Markdown portable. Image URLs are fine |
| **Free-form canvas** | Trees only. If you want sticky notes placed anywhere, this is the wrong tool |
| **Real-time collaboration** | Out of scope. Several people means several repositories, one each |
| **Presenting and print layout** | The goal is thinking, not producing a deliverable |
| **AI that draws the map for you** | Left out on purpose. Doing the thinking is the point |
| **Blockquotes and fenced code blocks** | **They are dropped on save today.** Known issue |
| **Backslash escapes** | An escaped asterisk does not survive a round trip. [Known issue](./docs/ideas/2026-09-04-escape-roundtrip.md) |

### It can

| Supported | Notes |
|---|---|
| Edit as a diagram | Canvas and outline views, `Ctrl+E` to switch |
| **Read the exact `.md` that gets saved** | A third view, read-only, byte-for-byte what is written |
| Work entirely from the keyboard | `?` shows the list |
| Go back to an earlier version | Every 5 minutes locally; every commit on GitHub |
| Render tables, bold, code and links | Inside notes |
| Full-text search and tag filters | `Ctrl+F` |
| Work offline | Installable as a PWA |
| Edit from a phone | When GitHub is the storage |

---

## How it compares

**If you only want to draw a mind map, there are tools with far more features.**
What is different here is that **you edit it as a diagram and the save format is Markdown itself.**

| | Edit as a diagram | Save format | Opens without an app | Phone | Cost |
|---|---|---|---|---|---|
| **Mieru** | yes | **`.md` itself** | yes, browser only | yes | Free |
| XMind | yes, strong | `.xmind` (proprietary) | no | yes | 10 maps free; Markdown export is paid |
| markmap / markmap for VS Code | view only | reads `.md` | no, needs VS Code | no | Free |
| Obsidian + Mind Map (markmap) | view only | reads `.md` | no, needs Obsidian | yes | Free |
| Obsidian + Enhancing Mindmap | yes | edits `.md` | no | yes | Free |
| Obsidian + Simple Mindmap | yes | import / export handoff | no | yes | Free |
| Obsidian Canvas | yes, free-form | **`.canvas` (JSON)** | no | yes | Free |

(Checked against each vendor's own pages on 2026-09-05.
Sources are in the [competitive research](./docs/ideas/2026-09-05-stp-and-marketing.md), in Japanese.)

**If you already use Obsidian, try the plugins first.**
Mieru cannot match Obsidian on search, backlinks or the breadth of its plugin ecosystem.
If everything you do fits inside the vault, that is usually the better answer.

**Reasons you might still pick Mieru:**

- **You want to reach your maps from a machine without Obsidian installed.** A browser is enough
- **Obsidian's own Canvas saves as JSON.** You want the result of thinking visually to stay `.md`
- **The editable mind map plugins have gone quiet.**
  Enhancing Mindmap, the most downloaded one, was last updated about three years ago
- **You want a guarantee that opening and saving does not change your file.**
  Round-tripping normalized `.md` is tested to be byte-identical, continuously,
  against randomly generated trees

---

## Common questions

**Where is my data, and who can see it?**
Only where you put it. **There is no server and no database.**
Mieru is served as static files; your maps never reach the developer.
With GitHub as storage, traffic goes straight from your browser to `api.github.com`.

**What is the GitHub token used for?**
Reading and writing `.md` files in the repository you named. Nothing else.
**The token is stored in this browser and it is not encrypted.**
That is why we suggest creating it for **one repository, Contents permission only,
with an expiry date.** The app walks you through it.
On a shared machine, untick "remember on this device."

**Is that actually safe?**
**Any app that runs only in a browser and handles credentials has code, delivered to you,
that can touch those credentials.** That is not specific to Mieru.
So it is made checkable instead. All the code is in this repository.
No third-party CDN, web font or analytics is loaded, and a Content Security Policy
restricts network access to `api.github.com`.
**Even if credential-stealing code got in, it would have nowhere to send anything.**
If you would rather not trust this origin, [host it yourself](./CONTRIBUTING.md).

**Does it work offline?**
Yes. It installs as a PWA and you can read and edit without a connection.
With GitHub storage, the save happens once you are back online.

**Which browsers work?**
Any browser, if you use GitHub as the storage.
Using a folder on your computer needs Edge or Chrome (it uses the File System Access API).

**Can I open `.md` files written elsewhere?**
Yes, but **saving reformats them into Mieru's style.**
The two known issues above (blockquotes and code blocks, backslash escapes)
**take effect the moment you open and save. Keep a copy of anything you care about.**

**Can I use it alongside Obsidian or VS Code?**
Yes. Point it at a folder in your vault or repository and both open the same `.md`.
Edit in either order, but **saving from Mieru normalizes the formatting.**

**Can several people edit together?**
No, and that is deliberate. For a group, each person uses their own repository.

---

## Contributing

Bug reports, ideas and code are all welcome.
Setup, project layout and how to send a change are in **[CONTRIBUTING.md](./CONTRIBUTING.md)**.

For the thinking behind the design, see the
[architecture notes](./docs/human-review/architecture.md) and the
[design index](./docs/design.md) (Japanese).
The current state of the project is in the [roadmap](./docs/human-review/roadmap.md) (Japanese).

## License

**MIT.** See [LICENSE](./LICENSE).
Use it, change it and redistribute it freely, commercially or otherwise.

## Contact

Bugs and ideas go to [Issues](https://github.com/mieru-app/mieru/issues).

**Please do not report security problems in a public issue.**
See [SECURITY.md](./SECURITY.md) for how to report privately, what is in scope,
and what is already known and accepted.
