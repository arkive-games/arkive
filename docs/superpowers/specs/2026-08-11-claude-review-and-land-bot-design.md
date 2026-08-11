# Claude review-and-land bot — Design

Date: 2026-08-11
Status: accepted, blocked on §9 Step 0

A GitHub Actions bot that reviews a pull request on request, repairs what stops it from
landing, and drives it through the existing fast-forward gate — bounded, auditable, and with
a human decision point in front of any opinionated edit.

Half of this already exists. `.github/workflows/fast-forward.yml` is a merge bot: it checks
requester permission, that the branch is rebased and merge-free, that every commit is
verified, and that `changelog:verify` passes, then pushes `master` and reports refusals as
comments. `ci.yml` builds, lints and tests every pull request. What is missing is the review
half, and the machinery that lets a refusal be repaired rather than merely reported.

The design keeps that division. Claude never touches `master`. It reviews, it repairs the
pull request branch, and it *asks* the gatekeeper — which stays deterministic bash.

## 1. Why the gatekeeper stays separate

The obvious shape is one workflow that reviews, fixes and pushes. It was rejected.

| | Shape | Verdict |
|---|---|---|
| **A. Two workflows** | `claude.yml` reviews and repairs the branch; `fast-forward.yml` alone advances `master` | **Accepted** |
| B. One workflow | a single job reviews, repairs, re-checks and pushes `master` | Rejected |
| C. Claude drives everything | give the agent `gh` and Contents:Write and one long prompt | Rejected |

B collapses the audit trail: the checks that protect `master` would run in the same job that
decided to land, so a prompt that talked the agent past a check would take the whole gate
with it. It also loses `/fast-forward` as a standalone human affordance.

C is B with the checks moved into the model's judgement, which is exactly the thing that must
not happen to a ref that pins release SHAs.

A costs one extra workflow round-trip per attempt. That is the price of keeping every
irreversible action behind bash that a human can read.

## 2. Trigger and authority

`claude.yml` runs on `issue_comment: [created]` where the comment body contains `@claude` and
`github.event.issue.pull_request != null`.

A preflight job resolves the commenter's permission with the same call `fast-forward.yml`
already uses:

```
gh api repos/$REPO/collaborators/$USER/permission --jq .permission
```

`admin`, `write` and `maintain` proceed. Anything else is ignored **silently** — no reply
comment. This repository is public; a refusal comment to a drive-by commenter is an
invitation to keep commenting, and every trigger spends tokens.

`author_association` is deliberately not used, for the reason already documented in
`fast-forward.yml`: it reports `MEMBER`/`CONTRIBUTOR` from org and commit history, neither of
which is push access.

The one exception is the bot itself — see §4.

## 3. Two verbs

| Comment | Behaviour |
|---|---|
| `@claude` or `@claude review` | Review the diff. Post findings. If nothing blocking was found, repair landing blockers and request the land. |
| `@claude fix` | Additionally implement its own review findings as commits, then the same path. |

The split is the human decision point. Repairing a *landing blocker* is mechanical — the
branch is behind, so rebase it; the rebase orphaned a `changelog.json` SHA, so re-point it.
Nothing about that is a judgement call, and no reasonable reviewer would want to be consulted
about it.

Implementing a *review finding* is a judgement call, and Claude would be both the critic and
the author of the fix with nothing in between. So `@claude review` stops and hands back; a
human replying `@claude fix` is the authorization.

**"Blocking" is defined narrowly**, because it is the judgement that decides whether a pull
request lands with no human in it. A finding blocks if it is a correctness defect, a security
or data-loss risk, or a violation of a stated repository invariant — a shared package reaching
for `localStorage`, an unregistered persistence key, a hard-coded pixel size, a changelog
entry stamped for internal-only work. Style preferences, naming opinions, "this could be
simpler", and speculative concerns do not block: they are posted as findings and the pull
request still lands. When the bot is unsure whether something blocks, it blocks — the cost of
a needless hand-back is one comment, and the cost of the other mistake is a bad commit on
`master` with no reviewer.

Landing-blocker repair, in order:

1. `git rebase origin/master` (signed — §5). Conflicts that do not resolve cleanly are
   reported, not guessed at.
2. `pnpm changelog:verify`; re-point any entry whose commit the rebase rewrote.
3. `git push --force-with-lease`.
4. Comment `/fast-forward`.

## 4. The retry chain, and what bounds it

`fast-forward.yml` refuses for a reason it writes to a comment. The chain exists so that
reason can be repaired instead of read.

The mechanism is token identity. A comment authored by `GITHUB_TOKEN` does not trigger
workflows — GitHub's recursion guard, and the same reason `fast-forward.yml` already carries
`FAST_FORWARD_TOKEN` for its push. So:

- `claude.yml` passes the App installation token as `github_token:`, and its `/fast-forward`
  comment therefore triggers the gatekeeper.
- When `fast-forward.yml` refuses **a bot-initiated attempt**, it posts the refusal addressed
  `@claude`, using `FAST_FORWARD_TOKEN` — a PAT, which also triggers workflows, and which that
  workflow already holds. That avoids giving the gatekeeper the App's private key just to write
  one comment; it needs `Pull-requests:Write` added for it.

`<id>` is the comment id of the *human* `@claude` that began the chain, so a chain is scoped
to one human request and a fresh request starts a fresh budget.

**Two sentinels, not one.** `<!-- claude-land chain=<id> -->` is written by `claude.yml` on each
`/fast-forward` request and is the thing counted; `<!-- claude-land-retry chain=<id> -->` is
written by `fast-forward.yml` on a refusal and is what re-enters the agent. Sharing one sentinel
would make every refusal spend a second attempt and halve the budget.

**The bot is authorised by login, never by the marker.** `fast-forward.yml` recognises it
against `vars.CLAUDE_BOT_LOGIN`, and only *then* reads the marker to learn which chain to reply
on. Authorising on the marker's presence would let any stranger paste that text into a
`/fast-forward` comment and walk straight past the permission gate. Leaving the variable unset
disables bot recognition entirely, which is the safe default and leaves the gatekeeper behaving
exactly as it did before this feature.

**The budget is counted, not parsed.** `claude.yml` counts how many comments on the pull
request already carry `chain=<id>` and refuses above **3**. Parsing an `attempt=N` written into
the comment was the first design and is weaker than it looks: Claude holds a token with
`issues: write`, so it could author a marker of its own, and a parsed counter can be reset by
writing `attempt=1`. A count cannot be reset — a spurious marker only spends budget faster.
That matters more than it might seem, because an unbounded loop here spends real money on the
gateway rather than merely looping.

Bot-authored triggers bypass §2's permission gate — otherwise the chain cannot close, since
the App is not a collaborator with a permission level. They bypass nothing else. A bot comment
triggers only when it carries a marker, and Claude never begins a comment with `@claude`, so
its own `/fast-forward` comments cannot re-enter the workflow.

On exhaustion the bot posts what it tried and what still refuses, and stops.

It does not escalate, retry with a different strategy, or ask for wider permissions.

## 5. Signing

A rebase rewrites commits, so the original author's signature is destroyed no matter who
performs the rebase. Removing the verification gate from `fast-forward.yml` was considered
and rejected: it is the check that catches unsigned *human* pushes, which is a separate
concern from the rebase that happens to be blocked by it.

Instead the bot signs. `anthropics/claude-code-action` exposes `use_commit_signing` and
`ssh_signing_key`; the bash rebase sets `gpg.format=ssh` and the matching `user.signingkey`.
Rebased commits keep the contributor as **author** and gain the bot as **signer**, and GitHub
reports them Verified provided the public half is registered as a signing key on the App's
identity.

The gate in `fast-forward.yml` is unchanged. `CLAUDE.md`'s "all commits must be signed" stays
literally true rather than becoming a stale claim.

Two details that are easy to get wrong and both fail in confusing ways:

- **An `allowed_signers` file is required, even though only GitHub's verification matters.**
  Without `gpg.ssh.allowedSignersFile`, git cannot verify an SSH signature locally, so `%G?`
  reports `E`/`N` for a perfectly good commit — and the run's own pre-push signature check would
  reject the commits it had just signed. The workflow derives the public half with
  `ssh-keygen -y` and writes the file itself.
- **`commit.gpgsign` does not cover a rebase.** `rebase.gpgSign` is a separate setting, and
  without it the rewritten commits come out unsigned — which is precisely the failure this
  section exists to prevent, arriving three workflow hops later as a fast-forward refusal.

The workflow proves both at setup time by making an empty signed commit and asserting `%G?` is
`G` before it touches the branch, rather than discovering it at the push.

## 6. Changes to `fast-forward.yml`

**New precondition — required checks green on the head SHA.** Today nothing asserts `ci.yml`
passed; a human supplies that judgement implicitly by only commenting `/fast-forward` on a
green pull request. Removing the human removes the check. This is a defect in the current
workflow independent of this feature, and fixing it helps the human path too.

**Refusals learn to address `@claude`** when the attempt was bot-initiated, carrying the
incremented depth marker (§4).

**The signature gate stays** (§5), and the "already rebased" precondition stays. The workflow
still never rebases for you — the bot rebases, on the branch, before asking.

## 7. Fork pull requests: review only

`FAST_FORWARD_TOKEN` and the App installation are scoped to `arkive-games/arkive`. A fork's
branch lives in someone else's repository, so Claude cannot force-push a rebase to it even
with `maintainer_can_modify` set, absent a token for that fork.

On a fork pull request the bot reviews and reports. Landing blockers are described for the
contributor to fix. This is a real limitation, not one the design can remove.

## 8. Untrusted input

The diff, the commit messages and the comment thread are all attacker-controlled on a public
repository, and `issue_comment` runs in base-repo context *with* secrets.

- The action is pinned to a **full commit SHA**, not `@v1`. A prompt-injection flaw in
  `claude-code-action` was fixed in v1.0.94; a floating major tag is not a defence.
- `allowed_non_write_users` is left empty, so only §2's write-permission holders trigger.
- **The model cannot push, comment, fetch or rebase.** `--allowedTools` grants reading, editing,
  and `git add`/`git commit`; deterministic steps do everything else. Three absences are
  deliberate and each has a reason:
  - no `Bash(git push:*)` — the push is one step, to one branch ref, under
    `--force-with-lease`.
  - no `Bash(gh:*)` — every comment is composed and posted by a step, so what the bot says is
    visible in the workflow rather than dependent on what the model chose to run.
  - no `Bash(git rebase:*)` — `git rebase --exec <cmd>` runs arbitrary commands, which would
    hand back everything the other two absences take away. **The rebase therefore happens in
    bash, before the agent starts**, and a conflict is reported rather than resolved. This is a
    change from the first draft of §3, where the agent rebased; the earlier version was a hole.
- **The verb guard is deterministic, and keyed on authorship.** "Do not edit code" lives in a
  prompt, and prompts are advisory, so a step verifies it. A rebase preserves the original
  author while replacing the committer, so any commit *authored* by the bot is the agent's own
  work — under the `review` verb, such a commit touching anything but `changelog.json` fails the
  run before the push.

**The App must be unable to push `master`, and today nothing stops it.** Repair needs
`contents: write`, which on GitHub is repo-wide — it is not scopeable to one branch. So an
agent holding the installation token *could* `git push origin HEAD:master` directly, which
§1 exists to prevent. The ruleset on `master` currently blocks only force pushes and
deletions, and a fast-forward push is neither.

The enforcement is a **"require a pull request before merging" rule on `master`, with bypass
granted to the repository-admin role only**. `fast-forward.yml` pushes with
`FAST_FORWARD_TOKEN`, a fine-grained PAT acting as an admin, so it bypasses and keeps working;
the App is not an admin and is refused at the ref. Prompt wording and `--allowedTools` are
defence in depth behind that, not the defence itself.

This needs verifying during setup rather than assuming: confirm `FAST_FORWARD_TOKEN` still
lands a pull request *after* the rule is added, before relying on the bot.

## 9. Gateway configuration, and Step 0

All model traffic goes through the Sub2API gateway at `https://api.tc-imba.com`, not
`api.anthropic.com`. Probed 2026-08-11:

| Probe | Result |
|---|---|
| `POST /v1/messages`, no credential | `401 API_KEY_REQUIRED` — reachable, TLS valid |
| `POST /v1/messages`, bad `x-api-key` | `401 INVALID_API_KEY` — **`x-api-key` accepted**, so `ANTHROPIC_API_KEY` works and no Bearer workaround is needed |
| `POST /v1/messages/count_tokens` | `401`, not `404` — endpoint routed |
| `POST //v1/messages` (trailing slash on base) | **`200` serving the gateway's SPA HTML** |
| Origin | `47.100.127.198`, Alibaba Cloud Shanghai |

Two consequences. `ANTHROPIC_BASE_URL` must be `https://api.tc-imba.com` with **no trailing
slash** — a trailing slash does not error, it returns HTML with a `200`, which fails as a
parse error far from its cause. And `ANTHROPIC_BASE_URL` is read from the **`env` context**
(`action.yml:154`), so it must be set at job or workflow level; setting it on the `uses:` step
does not populate that context.

The model is **`claude-opus-5`**, passed as `claude_args: --model claude-opus-5`. The
1M-context variant is deliberately not used: `[1m]` is Claude Code alias syntax that resolves
to a beta header rather than a model id, and a proxy is one more place for a beta header to be
dropped silently. If a review ever needs more context than the default window, the fix is a
narrower prompt, not a longer one.

**Step 0 gates everything else.** Before the rest is trusted, a throwaway workflow runs the
action against the gateway from a real runner with a trivial prompt, and must establish:

1. The key authenticates from Azure (not merely from this LAN).
2. `claude-opus-5` resolves through the gateway under a real agent session.
3. `count_tokens` answers rather than 404s.
4. Cross-border latency and the gateway's Opus quota tolerate a full-diff review.

Nothing above is worth building if the gateway does not hold up under an agent session. The
throwaway workflow is deleted once its result is recorded here.

## 10. Instruction change

After `gh pr create`, the local agent comments `@claude` on the new pull request to request
review.

This belongs in `.apm/instructions/*.instructions.md` followed by `apm compile` — `CLAUDE.md`
and `AGENTS.md` are generated, and a hand edit to either is discarded on the next compile.

## 11. Out of scope

- Reviewing on `pull_request` events. Review is on request only; every push triggering a
  review would spend the gateway's Opus budget on work in progress.
- Approving pull requests. The bot comments; it does not submit an approving review, and it
  does not satisfy a required-reviewer rule.
- Any path by which the bot pushes `master` directly.
