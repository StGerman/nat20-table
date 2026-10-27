# 0023. Upstream declines our contributions: keep a long-lived fork that syncs upstream main

- **Status:** Accepted (its PROGRESS.md part superseded by [0037](0037-fork-keeps-progress-md.md): core PRs into `demo` keep their PROGRESS.md rows)
- **Date:** 2026-10-18
- **Decided by:** Stas, in the project thread "Mads's reply" (picked "Fork" from Fork / Retry / Hard-fork). Supersedes [0020](0020-send-u1-u2-upstream-early.md) and the upstream-proposal parts of [0002](0002-fork-and-own-repo.md).

## Context

On 2026-10-18 the maintainer of MadsWedendahlKruse/nat20 answered the monster-format issue (upstream #4) with one comment covering it and both PRs. He has several problems with AI-generated code, uses it very sparingly, and is "not interested in anything someone else has vibe-coded". He closed the issue as completed and closed upstream #2 (U1 registry root) and #3 (U2 seedable dice) the same day, without merging them.

All our core work is AI-authored, so every item planned for Milestone 8 would get the same answer: U3 to U7, core #3 to #10, and the content items. Nothing breaks. nat20-table pins fork `demo` at 031f7a2, which carries U1, U2 and every core change built so far. Milestone 4's fork items (U9 to U18 in its spec) still have to be built, and they would have been built in the fork either way. Upstream is MIT, so a permanent fork is allowed as long as the licence notice and his authorship stay intact.

Checked the same day: none of the other four public forks of upstream has original work worth taking. Three mirror his January main. One carries six lint and `cargo fix` commits, 180 commits behind. His `main` (334 commits) is still where his rules work lands.

## Options

### A. Retry: Stas writes to him and offers one small, hand-written change
- Pro: keeps a path to upstream review.
- Con: low odds, since the objection is to how the code is made, not to any one PR.
- Con: costs Stas's own time on every item.

### B. Long-lived fork that keeps syncing upstream `main` into ours
- Pro: we keep his ongoing rule fixes and new SRD content at the cost of one merge per sync.
- Pro: the fork can now hold what we need without upstream's constraints: our CI, our dependency policy (decision 0024), structural changes.
- Con: every core change we carry widens the diff, and each sync can conflict where he changes the same code.

### C. Hard fork: stop syncing, rename the crate
- Pro: no merge conflicts ever.
- Con: we lose his future fixes and content; the rules engine becomes entirely ours to maintain.
- Con: a rename touches every pin, import and doc for no gain while syncing is cheap.

## Decision

B. The fork stays `StGerman/nat20` and keeps the name `nat20_core`. `main` stays an exact mirror of upstream `main`; `demo` is our engine branch. Upstream `main` is merged into `demo` regularly, never rebased, because nat20-table pins `demo` commits by rev. Nothing more goes upstream, and Milestone 8 (upstream proposal) is dropped.

## Consequences

- CLAUDE.md Rule 6 is rewritten:
  - Core changes branch off `demo` (`core/<topic>`), not upstream `main`, and merge with a merge commit so pinned heads stay reachable.
  - Generic SRD content goes into core's registry tree; content only our adventure needs goes into table's `nat20_demo::` overlay.
  - The maintainer's-style requirements that only served review are gone: PROGRESS.md rows and one item per upstream PR.
  - What keeps syncs cheap stays: registry JSON over code, tests in `core/tests/`, regenerated `.schemas`.
  - Fork upkeep files (CI workflows, `dependabot.yml`, `deny.toml`) may live on `demo`.
  - The server, the contract, game code, scenario data and API vocabulary still never enter core. The reason is now layering (core stays a rules engine), not upstream review.
- CLAUDE.md Rule 5: "fix it in the fork as an upstream item" becomes "fix it in the fork". Rule 8 drops the `upstream:` PR prefix and the Gate field; earlier `upstream #N` references stay valid as history.
- Milestones: 1 to 7. Milestone 8 is dropped.
- TASKS.md:
  - Dest `Up` and `Up?` rows read as `Fork`, and Gate is retired.
  - UPS-3, UPS-4 and UPS-7 become won't do, a status Rule 8 now lists, which counts as closed.
  - UPS-6 and UPS-8 to UPS-10 are done in the fork.
  - UPS-2 changes from rebase to merge sync.
  - New fork-upkeep rows follow from decision 0024.
- The fork stays a GitHub fork, public, with his commit history and MIT `LICENSE` intact. The upstream-bound authorship convention (Stas as author, Claude as co-author) no longer applies to core commits.
- The scope doc's "Fork workflow" block and its "Strategy" line get a pointer to this record. CLAUDE.md lets the scope change only with Stas's agreement; merging the PR that adds this record gives it.
- The closed upstream PRs and issue stay as they are. No reply was sent from this project; Stas may answer him personally.

## Revisit when

- The maintainer invites contributions again.
- His `main` diverges so far that a sync costs more than the fixes it brings: two consecutive syncs each need more than a day of conflict work.
- He changes the licence of future commits.

## Sources

- Upstream issue #4 comment and the closed upstream #2 and #3 (MadsWedendahlKruse/nat20), 2026-10-18.
- Fork survey: `git ls-remote` of the four other forks listed by the GitHub API, compared against upstream `main` 9aaca2f.
- Project files `engine/deps/nat20-dependency-audit-2026-10-18.md`; project thread "Mads's reply".
