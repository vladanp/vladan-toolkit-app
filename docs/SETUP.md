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

**Settings → Advanced Security**: enable everything that's offered for public repos:

- **Dependency graph** (required: the `Security / Dependency review` check fails without it)
- Dependabot alerts and security updates
- Secret scanning with **push protection**
- Private vulnerability reporting

## 5. Auto-update signing key (enables in-app updates)

Run on **your own machine** (the private key must never be committed or pasted anywhere else):

```sh
pnpm tauri signer generate -w ~/.tauri/vladan-toolkit.key
```

Then **Settings → Environments → New environment** named **`release`**:

- *Deployment branches and tags:* **Selected branches and tags** → add `main` and tags `v*`
- *Environment secrets:*
  - `TAURI_SIGNING_PRIVATE_KEY`: contents of `~/.tauri/vladan-toolkit.key`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password you chose
- *Environment variables:*
  - `TAURI_UPDATER_PUBKEY`: contents of `~/.tauri/vladan-toolkit.key.pub`

Back up the private key (e.g. in a password manager): if it's lost, already-installed apps
can no longer verify new updates.

Until this is done, releases still build installers; they just don't include update bundles.

## 6. Let CI run on release PRs

PRs created with the default `GITHUB_TOKEN` don't trigger other workflows, so the release
PR would never get the `CI OK` check that step 3 requires, and could not be merged. Create a
fine-grained token (this repo only; *Contents* and *Pull requests*: read & write) and save it
as the `RELEASE_PLEASE_TOKEN` secret in the `release` environment. It expires: renew it
before then.

## 7. (Optional) Code signing

Two different signatures are involved:

- **Update signing** (step 5, free): proves an update came from you. The app refuses updates
  that aren't signed with your key. Windows and macOS don't know about this key.
- **Code signing** (this step, paid): proves to Windows and macOS who published the installer.
  Without it, the first install shows a warning once (see the README). Updates installed by
  the app itself are downloaded by the app, not a browser, so they don't show it again.

To remove the first-install warning:

- **macOS:** join the Apple Developer Program (yearly fee), create a "Developer ID
  Application" certificate, and add `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password) and
  `APPLE_TEAM_ID` to the `release` environment. The release workflow then signs and
  notarizes automatically, and macOS opens the app without any warning. Until then the app
  is ad-hoc signed (`signingIdentity: "-"`), which keeps Apple Silicon from calling it
  "damaged" but still needs **Open Anyway** once.
- **Windows:** SmartScreen trusts a signed app once it has built up download reputation, so
  even a signed installer can warn for its first releases; the warning then names you as
  the publisher. Options:
  - [SignPath Foundation](https://signpath.org): free for open source projects like this
    one (MIT, built in GitHub Actions). The certificate is issued to SignPath Foundation, and
    you publish a short code signing policy.
  - [Azure Artifact Signing](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options):
    a monthly fee; open to organizations in more countries, but to individuals only in some.
  - A certificate from a certificate authority; the private key must live on a hardware token
    or a cloud signing service.

  Each plugs into Tauri's `bundle.windows.signCommand`; ask for it when you get there.
