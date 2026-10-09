# Security policy

## Reporting a vulnerability

Please report vulnerabilities **privately** via
[GitHub security advisories](https://github.com/vladanp/vladan-toolkit-app/security/advisories/new),
not in public issues. You'll get a response within a few days.

## Supported versions

Only the latest release receives fixes. The app updates itself, so keeping auto-update on is
the easiest way to stay current.

## How the project stays secure

- **App**: strict Content Security Policy, least-privilege Tauri capabilities, external
  links limited to `https:`/`mailto:`, no `unsafe` Rust, updates verified with a signing key.
- **Dependencies**: pnpm refuses packages published less than 24h ago and blocks install
  scripts; Dependabot updates weekly after a 7-day cooldown; `pnpm audit`, `cargo-deny` and
  GitHub dependency review gate every change.
- **Build**: GitHub Actions pinned by commit SHA and linted with zizmor; CodeQL and OpenSSF
  Scorecard run continuously; release signing keys live in a protected environment; every
  installer ships with SLSA build provenance. Verify one with
  `gh attestation verify <file> --repo vladanp/vladan-toolkit-app`.
