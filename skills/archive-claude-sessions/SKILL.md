---
name: archive-claude-sessions
description: Review and archive old Claude Desktop Code sessions using a supplied cutoff.
disable-model-invocation: true
---

# Archive Claude Desktop Code sessions

Use Claude Desktop's supported Code session-management tools. Never edit Claude's local session files, call private endpoints, or substitute deletion for archival.

## Plan

1. Read the cutoff from the invocation, such as `14 days ago` or `before 2026-10-01`. If it is missing or ambiguous, ask for it.
2. Resolve a relative cutoff against the current local date and time. State the exact resolved cutoff, including the time zone.
3. Enumerate every unarchived Desktop-managed Code session across local, SSH, and WSL environments. Continue through every result page instead of stopping at the first page.
4. Exclude:
   - this session;
   - sessions that are running or whose execution state is uncertain;
   - sessions last active at or after the cutoff;
   - sessions whose worktree has uncommitted or otherwise unpreserved changes;
   - sessions whose activity time, archive state, environment, or worktree safety cannot be verified.
5. Present the candidates before changing anything. For each candidate, show its name, last activity, environment, and worktree status. Also summarize exclusions by reason.
6. Stop and wait for explicit approval of that candidate list. If the user changes the cutoff or scope, build a fresh plan.

## Apply

1. Archive only the approved candidates with Claude Desktop's supported session archive action.
2. Do not archive a candidate whose state changed after approval. Report it as skipped instead.
3. Verify that every successfully processed candidate appears archived and no longer appears in the unarchived list.
4. Report archived, skipped, and failed sessions separately. Include a short reason for every skip or failure.

Archiving is reversible organization, not deletion. A Desktop worktree may be removed as part of archiving, so uncertain or unpreserved work is always a hard stop for that session.
