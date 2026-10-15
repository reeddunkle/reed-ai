# Claude Desktop Code-session archival

Research date: 2026-10-15

## Conclusion

Claude Desktop's Code tab has a real Archive operation that is distinct from Delete. The earlier assumption that Claude offered only `cleanupPeriodDays` deletion was incorrect for sessions created by the Desktop Code tab.

Anthropic supports two ways to invoke Archive in Desktop:

- Click the archive icon on a session in the Code sidebar.
- Ask Claude, from a Code-tab session, to archive another Desktop Code session. Anthropic says this performs the same operation as the sidebar icon.

Anthropic does not currently document a standalone CLI command, public API, settings key, or local file protocol for listing and archiving Desktop Code sessions by age. The installed Claude Code CLI contains internal archive/unarchive client code, but that is not a supported integration contract and appears to serve cloud/Remote Control session state. It should not be called directly by `reed-ai`.

The safe product boundary is therefore:

1. Keep `reed-ai`'s Codex archival automation as-is.
2. Add Claude Desktop archival only if it is implemented through the supported in-app Code-session agent surface or a future documented API.
3. Do not implement it by moving or editing `~/.claude/projects` transcripts, changing undocumented Desktop metadata, replaying private HTTP endpoints, or treating `cleanupPeriodDays` as archival.

## What Archive does

Anthropic's Desktop documentation describes each Code-tab conversation as an independent session with its own history and project folder. A user can archive a session from the sidebar, and Desktop can auto-archive a finished local session after its pull request merges or closes. For worktree sessions, the documentation explicitly associates the archive icon with removing the worktree, so Archive is not merely a cosmetic list flag and a bulk tool must account for uncommitted work before archiving. [Desktop application: sessions and worktrees](https://code.claude.com/docs/en/desktop#work-in-parallel-with-sessions)

The same documentation says Claude in one Code-tab session can list, inspect, rename, and archive other sessions. This surface covers sessions the Desktop app runs itself: local, SSH, and WSL sessions. It excludes cloud sessions and sessions started in the terminal CLI or VS Code. It considers the 20 most recently active sessions by default, skips archived sessions unless asked, never lists the requesting session, and requires an approval card before archival in Manual mode. [Desktop application: work across sessions](https://code.claude.com/docs/en/desktop#work-across-sessions)

For sessions that have a Remote Control copy, archiving in Desktop also archives that copy and hides it from the default list on other devices. [Desktop application: control session visibility](https://code.claude.com/docs/en/desktop#control-which-sessions-appear-on-your-other-devices)

For cloud sessions, Anthropic documents the semantic distinction directly: Archive hides a session from the default list while leaving it viewable through the archived filter; Delete permanently removes the session and its data and cannot be undone. [Claude Code in the cloud: archive and delete sessions](https://code.claude.com/docs/en/claude-code-on-the-web#archive-sessions)

The cloud-session wording does not, by itself, prove every local worktree artifact is preserved. The Desktop documentation instead indicates that archiving is the normal way to remove a worktree. Any automated local-session policy should therefore protect running sessions and sessions with uncommitted work, not assume Archive is a metadata-only operation.

## Supported automation surfaces

### Supported today

The supported programmable-like surface is natural-language control from an active Claude Desktop Code session. Anthropic explicitly documents prompts such as asking Claude to archive another session, with the same effect as clicking the archive icon. This is suitable for interactive cleanup because the user can keep the session in Manual mode and approve each archival action. [Desktop application: work across sessions](https://code.claude.com/docs/en/desktop#work-across-sessions)

Desktop also has a supported `Auto-archive after PR merge or close` setting. It applies only to local sessions that have finished running and is event-based, not age-based. [Desktop application: sessions and worktrees](https://code.claude.com/docs/en/desktop#work-in-parallel-with-sessions)

### Not documented as supported

The current Claude Code CLI is version `2.1.296`. Its public `--help` surface has resume, continue, cloud-session, background-session, and purge operations, but no command for archiving a Desktop Code session. The official CLI reference likewise documents session continuation and resume but no archive command. [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)

The installed executable contains bundled symbols named `archiveCodeSession` and `unarchiveCodeSession` and internal `/archive` and `/unarchive` request paths. Those implementation details are not exposed by the documented CLI, are authenticated with account/device state, and are used in code paths for cloud and Remote Control sessions. They are evidence that Archive is a first-class backend state, but not permission to depend on a private protocol. Reproducing those requests would create a brittle, unsupported dependency on internal authentication and response formats.

No archive field was found in the top-level keys of `~/.claude.json`, `~/.claude/settings.json`, or the documented Claude Code settings. Editing transcript JSONL files or relocating project directories would therefore imitate neither the documented Desktop action nor its worktree/process handling.

## Implications for a 14-day policy

A fully unattended `reed-ai conversations apply` implementation for Claude Desktop is not justified by the supported interfaces currently documented. The in-app agent surface is real and useful, but it is scoped to a live Desktop Code session and has behavioral limits that conflict with a deterministic background job:

- It excludes the requesting session.
- It sees only Desktop-managed local, SSH, and WSL sessions through this surface.
- It considers only the 20 most recently active sessions by default.
- Manual mode requests approval for archival; Auto and Bypass modes may archive without approval.
- Archiving a worktree session can remove its worktree.

A reasonable manual workflow is to open a disposable or otherwise protected Desktop Code session in Manual mode and ask:

> List all unarchived Desktop Code sessions last active before 2026-10-01. Exclude this session, anything still running, and any session whose worktree has uncommitted changes. Show the candidates first. After I approve the list, archive them using the supported session archive action.

That prompt preserves the existing plan/apply idea at the interaction level, but it is not a stable machine API and should not be presented as equivalent to `reed-ai`'s deterministic Codex adapter.

## Recommendation

Do not add an undocumented Claude adapter to `reed-ai` yet. Update the tool's reporting and documentation so it no longer says Claude lacks archival. Instead, report that Claude Desktop Code archival is supported interactively, while age-based standalone automation is pending a documented API or CLI command.

If a semi-automated workflow is valuable now, add a command that prints a date-resolved prompt like the one above and instructions to run it in a Claude Desktop Code session. Keep it plan-first and warn that archiving worktree sessions may remove their worktrees. A future native adapter should require a documented enumeration/archive interface, stable session timestamps, running-state checks, and an explicit dirty-worktree guard.

## Sources and verification

- [Anthropic Claude Code Desktop documentation](https://code.claude.com/docs/en/desktop)
- [Anthropic Claude Code cloud-session documentation](https://code.claude.com/docs/en/claude-code-on-the-web)
- [Anthropic Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)
- Local read-only inspection of Claude Code `2.1.296` at `C:\Users\reedd\.local\bin\claude.exe` using `claude --help` and binary string search. No credentials, transcript contents, session mutations, or private requests were used.
