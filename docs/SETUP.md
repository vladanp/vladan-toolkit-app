# One-time GitHub setup

Everything in this repository is automated, but a few switches live in the GitHub UI and
can't be set from code. Do these once, in order. Each takes under a minute.

## 1. Merging & pull requests

**Settings → General → Pull Requests**

- ☑ Allow squash merging → *Default commit message:* **Pull request title**
- ☐ Allow merge commits, ☐ Allow rebase merging (keeps history = one Conventional Commit per PR)
- ☑ Allow auto-merge (Dependabot patch/minor updates merge themselves when green)
- ☑ Automatically delete head branches

## 2. Actions permissions

**Settings → Actions → General → Workflow permissions**

- ◉ Read repository contents and packages permissions (workflows request more per job)
- ☑ Allow GitHub Actions to create and approve pull requests (needed by release-please)

## 3. Protect `main`

**Settings → Rules → Rulesets → New branch ruleset** (target: default branch)

- ☑ Restrict deletions, ☑ Block force pushes, ☑ Require linear history
- ☑ Require a pull request before merging
- ☑ Require status checks to pass: **`CI OK`**, **`Conventional PR title`**
- ☑ Require code scanning results: CodeQL (optional but recommended)

## 4. Security features

**Settings → Advanced Security** — enable everything that's offered for public repos:
Dependabot alerts and security updates, secret scanning with **push protection**,
private vulnerability reporting.

## 5. Auto-update signing key (enables in-app updates)

Run on **your own machine** (the private key must never be committed or pasted anywhere else):

```sh
pnpm tauri signer generate -w ~/.tauri/vladan-toolkit.key
```

Then **Settings → Environments → New environment** named **`release`**:

- *Deployment branches and tags:* **Selected branches and tags** → add `main` and tags `v*`
- *Environment secrets:*
  - `TAURI_SIGNING_PRIVATE_KEY` — contents of `~/.tauri/vladan-toolkit.key`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password you chose
- *Environment variables:*
  - `TAURI_UPDATER_PUBKEY` — contents of `~/.tauri/vladan-toolkit.key.pub`

Back up the private key (e.g. in a password manager): if it's lost, already-installed apps
can no longer verify new updates.

Until this is done, releases still build installers; they just don't include update bundles.

## 6. (Optional) Let CI run on release PRs

PRs created with the default `GITHUB_TOKEN` don't trigger other workflows, so the release
PR shows no checks. To fix that, create a fine-grained token (this repo only; *Contents* and
*Pull requests*: read & write) and save it as the `RELEASE_PLEASE_TOKEN` secret in the
`release` environment.

## 7. (Optional) Code signing

Unsigned installers work: macOS asks to right-click → Open once, Windows SmartScreen shows
"More info → Run anyway". To remove those prompts later:

- **macOS** (Apple Developer Program): add `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` to the `release`
  environment. The release workflow signs and notarizes automatically when they exist.
- **Windows**: Azure Trusted Signing needs a `signCommand` in `tauri.conf.json` — ask for it
  when you get there.
