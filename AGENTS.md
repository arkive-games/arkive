# AGENTS.md

**Read [`CLAUDE.md`](./CLAUDE.md) first and follow it.** It is the single source of truth
for this workspace — layout, the data-flow contract, the coordinate transform, and all
working conventions (worktrees, rebase-not-merge, dev-server ports, typography rules,
the changelog/version-history procedure).

This file exists only so agents that look for `AGENTS.md` find their way there. Do **not**
copy `CLAUDE.md`'s content into here — a duplicate will drift out of date and the two
files will start disagreeing. If a convention changes, change it in `CLAUDE.md`.

## Notes for non-Claude agents

`CLAUDE.md` is checked in, but per-user global instructions are not. Two of those apply
to everyone working in this repo:

- **All commits must be signed.** Never pass `--no-gpg-sign` or otherwise bypass signing.
  `commit.gpgsign=true` and a signing key are configured, so a plain `git commit` signs
  automatically. If a commit fails to sign, fix the signing setup rather than committing
  unsigned.
- **Do the work directly.** Coding, design, planning, research, review, and verification
  are yours to do — don't hand them off to another agent or CLI.

Right now `CLAUDE.md` at the repo root is the only one; if a subdirectory ever gains its
own, read the closest one in addition to the root.
