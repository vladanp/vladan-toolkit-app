# Contributing

## Setup

Requirements: Node ≥ 22.18, pnpm 12 (`corepack enable` or `npm i -g pnpm`), Rust stable, and
the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```sh
pnpm install   # also installs the git hooks
pnpm dev       # run the app
```

## Workflow

1. Branch from `main`, make the change, add tests.
2. Commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat: …`,
   `fix: …`). The commit-msg hook checks it.
3. Open a PR with a Conventional title; it's squash-merged and becomes the release note.

Git hooks run automatically: formatting, secret scanning and type checks before each commit;
lint, unit tests and Rust checks before each push. CI runs the full suite (including
end-to-end tests on all three operating systems).

See [CLAUDE.md](CLAUDE.md) for architecture, conventions and how to add a tool.
