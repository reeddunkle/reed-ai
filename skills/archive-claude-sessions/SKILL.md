---
name: archive-claude-sessions
description: Archive old Claude Desktop Code sessions older than a supplied cutoff without per-session approval.
disable-model-invocation: true
allowed-tools: mcp__ccd_session_mgmt__list_sessions mcp__ccd_session_mgmt__get_session mcp__ccd_session_mgmt__archive_session
---

# Archive Claude Desktop Code sessions

Use Claude Desktop's supported Code session-management tools. Never edit Claude's local session files, call private endpoints, or substitute deletion for archival.

Invoking this skill with a cutoff is the approval. After the cutoff is settled, do not ask for confirmation, do not present a candidate list, and do not post per-session progress. Send one report when finished.

## Cutoff

1. Read the cutoff from the invocation, such as `7 days ago` or `before 2026-10-01`. Ask only if it is missing or ambiguous.
2. Resolve a relative cutoff against the current local date and time. State the exact resolved cutoff, including the time zone, in one line, then continue immediately.

## Select

1. Enumerate every unarchived Desktop-managed Code session across local, SSH, and WSL environments. Continue through every result page instead of stopping at the first page.
2. Skip, without asking:
   - this session;
   - sessions that are running or whose execution state is uncertain;
   - sessions last active at or after the cutoff;
   - sessions whose worktree has uncommitted or otherwise unpreserved changes;
   - sessions whose activity time, archive state, environment, or worktree safety cannot be verified.

Archiving may remove a Desktop worktree, so uncertain or unpreserved work is always a hard skip for that session.

## Archive

1. Archive the remaining sessions with Claude Desktop's supported session archive action. Issue the archive calls in parallel batches of about 20 per message.
2. Do not re-verify sessions individually between batches.
3. After the last batch, list unarchived sessions once and confirm no archived session still appears.

## Report

Send a single final message:

- the resolved cutoff;
- counts of archived, skipped, and failed sessions;
- skipped and failed sessions, each with a one-line reason;
- archived session names as one compact comma-separated list.

Archiving is reversible organization, not deletion.
